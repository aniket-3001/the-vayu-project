import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ReplayManifest, ReplayPlaceSeries } from '@vayu/contracts';
import { REPLAY_INDEX_KEY, replayKey, type ReplayRepo } from '@vayu/data';
import { z } from 'zod';
import { traced } from './tracing';

/** Reads prepared replay weeks from `replay/` in the data bucket. A missing file is "not there", not an error. */
export function s3ReplayRepo(
  bucket: string,
  client: Pick<S3Client, 'send'> = traced(new S3Client({})),
): ReplayRepo {
  const read = async (key: string): Promise<unknown> => {
    try {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return JSON.parse((await out.Body?.transformToString()) ?? 'null') as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') return undefined;
      throw error;
    }
  };
  return {
    async weeks() {
      const index = await read(REPLAY_INDEX_KEY);
      return index === undefined ? [] : z.array(ReplayManifest).parse(index);
    },
    async manifest(weekId) {
      const body = await read(replayKey(weekId, 'manifest'));
      return body === undefined ? undefined : ReplayManifest.parse(body);
    },
    async series(weekId, placeId) {
      const body = await read(replayKey(weekId, placeId));
      return body === undefined ? undefined : ReplayPlaceSeries.parse(body);
    },
  };
}
