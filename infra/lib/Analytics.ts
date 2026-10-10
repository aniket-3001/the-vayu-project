import { Stack } from 'aws-cdk-lib';
import { CfnWorkGroup, CfnNamedQuery } from 'aws-cdk-lib/aws-athena';
import { CfnDatabase, CfnTable } from 'aws-cdk-lib/aws-glue';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  ARCHIVE_CHECK_SQL,
  DATABASE,
  DEVICE_HISTORY_SQL,
  FORECAST_ERROR_SQL,
  HARVEST_COVERAGE_SQL,
} from './queries';

/** One query may read at most this much (rule I15). The archive and our harvest are tiny; this is a ceiling. */
export const SCAN_LIMIT_BYTES = 1024 ** 3;
export const WORKGROUP = 'vayu';

const JSON_SERDE = 'org.openx.data.jsonserde.JsonSerDe';
const HOUR = 'array<struct<hourstart:string,pm25:double,pm10:double>>';

export interface AnalyticsProps {
  readonly dataBucket: IBucket;
}

/**
 * Athena over what we collect and over the public OpenAQ archive. The harvest tables read our own
 * S3 lines; the archive table reads the public bucket, which lives in another region (AWS allows
 * this, with data-transfer charges that are negligible at this size). The workgroup refuses any
 * query that would scan more than a gigabyte.
 */
export class Analytics extends Construct {
  constructor(scope: Construct, id: string, props: AnalyticsProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const catalogId = stack.account;

    const database = new CfnDatabase(this, 'Database', {
      catalogId,
      databaseInput: {
        name: DATABASE,
        description: 'Vayu air data: harvest and the OpenAQ archive',
      },
    });

    const dayPartition = (name: string): Record<string, string> => ({
      'projection.enabled': 'true',
      'projection.dt.type': 'date',
      'projection.dt.format': 'yyyy-MM-dd',
      'projection.dt.range': '2026-10-01,NOW',
      'projection.dt.interval': '1',
      'projection.dt.interval.unit': 'DAYS',
      'storage.location.template': `s3://${props.dataBucket.bucketName}/harvest/${name}/dt=\${dt}/`,
    });

    const harvestTable = (
      name: 'station' | 'forecast',
      columns: { name: string; type: string }[],
    ): CfnTable => {
      const table = new CfnTable(this, `Harvest${name === 'station' ? 'Station' : 'Forecast'}`, {
        catalogId,
        databaseName: DATABASE,
        tableInput: {
          name: `harvest_${name}`,
          tableType: 'EXTERNAL_TABLE',
          parameters: { classification: 'json', ...dayPartition(name) },
          partitionKeys: [{ name: 'dt', type: 'string' }],
          storageDescriptor: {
            location: `s3://${props.dataBucket.bucketName}/harvest/${name}/`,
            inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
            outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
            serdeInfo: { serializationLibrary: JSON_SERDE },
            columns,
          },
        },
      });
      table.addResourceDependency(database);
      return table;
    };

    harvestTable('station', [
      { name: 'schemaversion', type: 'int' },
      { name: 'harvestedat', type: 'string' },
      { name: 'placeid', type: 'string' },
      { name: 'status', type: 'string' },
      {
        name: 'station',
        type: 'struct<id:string,name:string,lat:double,lng:double,distancekm:double>',
      },
      { name: 'hours', type: HOUR },
    ]);
    harvestTable('forecast', [
      { name: 'schemaversion', type: 'int' },
      { name: 'harvestedat', type: 'string' },
      { name: 'placeid', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'hours', type: HOUR },
    ]);

    // Every reading a unit has sent, batched into S3 by Firehose (gzip JSON lines, one folder a day).
    const deviceTable = new CfnTable(this, 'DeviceReadings', {
      catalogId,
      databaseName: DATABASE,
      tableInput: {
        name: 'device_readings',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          classification: 'json',
          'projection.enabled': 'true',
          'projection.dt.type': 'date',
          'projection.dt.format': 'yyyy-MM-dd',
          'projection.dt.range': '2026-10-01,NOW',
          'projection.dt.interval': '1',
          'projection.dt.interval.unit': 'DAYS',
          'storage.location.template': `s3://${props.dataBucket.bucketName}/device/readings/dt=\${dt}/`,
        },
        partitionKeys: [{ name: 'dt', type: 'string' }],
        storageDescriptor: {
          location: `s3://${props.dataBucket.bucketName}/device/readings/`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: { serializationLibrary: JSON_SERDE },
          columns: [
            { name: 'thingid', type: 'string' },
            { name: 'ts', type: 'string' },
            { name: 'seq', type: 'int' },
            { name: 'pm1', type: 'double' },
            { name: 'pm25', type: 'double' },
            { name: 'pm4', type: 'double' },
            { name: 'pm10', type: 'double' },
            { name: 'tempc', type: 'double' },
            { name: 'rhpct', type: 'double' },
            { name: 'fw', type: 'string' },
            { name: 'simulated', type: 'boolean' },
          ],
        },
      },
    });
    deviceTable.addResourceDependency(database);

    const archive = new CfnTable(this, 'OpenAqArchive', {
      catalogId,
      databaseName: DATABASE,
      tableInput: {
        name: 'openaq_archive',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          classification: 'csv',
          'skip.header.line.count': '1',
          'projection.enabled': 'true',
          // Injected, not a range: there are millions of locations, so a range makes Athena
          // enumerate them all and the query never starts (found by running it on 8 Oct). Injected
          // makes every query name its locations (= or IN), which also keeps each scan small.
          'projection.locationid.type': 'injected',
          'projection.year.type': 'integer',
          'projection.year.range': '2016,2030',
          'projection.month.type': 'integer',
          'projection.month.range': '1,12',
          'projection.month.digits': '2',
          'storage.location.template':
            's3://openaq-data-archive/records/csv.gz/locationid=${locationid}/year=${year}/month=${month}/',
        },
        partitionKeys: [
          { name: 'locationid', type: 'int' },
          { name: 'year', type: 'int' },
          { name: 'month', type: 'int' },
        ],
        storageDescriptor: {
          location: 's3://openaq-data-archive/records/csv.gz/',
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: { serializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde' },
          columns: [
            'location_id',
            'sensors_id',
            'location',
            'datetime',
            'lat',
            'lon',
            'parameter',
            'units',
            'value',
          ].map((name) => ({ name, type: 'string' })),
        },
      },
    });
    archive.addResourceDependency(database);

    const workgroup = new CfnWorkGroup(this, 'WorkGroup', {
      name: WORKGROUP,
      description: 'Vayu queries. Refuses any query that would scan more than 1 GB.',
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: true,
        bytesScannedCutoffPerQuery: SCAN_LIMIT_BYTES,
        engineVersion: { selectedEngineVersion: 'Athena engine version 3' },
        resultConfiguration: {
          outputLocation: `s3://${props.dataBucket.bucketName}/athena-results/`,
        },
      },
    });

    for (const [name, description, sql] of [
      [
        'archive-check-december-2025',
        'Does the OpenAQ archive hold December 2025 PM2.5 for the stations week W1 uses?',
        ARCHIVE_CHECK_SQL,
      ],
      [
        'forecast-error-by-lead-time',
        'How wrong the regional forecast is, by how far ahead it looked',
        FORECAST_ERROR_SQL,
      ],
      [
        'device-history',
        'Readings per unit per day, and how many were simulated',
        DEVICE_HISTORY_SQL,
      ],
      [
        'harvest-coverage',
        'Days of harvest and how many places had a fresh station',
        HARVEST_COVERAGE_SQL,
      ],
    ] as const) {
      const query = new CfnNamedQuery(this, `Query-${name}`, {
        name,
        description,
        database: DATABASE,
        workGroup: WORKGROUP,
        queryString: sql,
      });
      query.addResourceDependency(workgroup);
      query.addResourceDependency(database);
    }
  }
}
