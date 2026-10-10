export interface ChartPoint {
  readonly ts: string;
  readonly value: number;
}

/**
 * A chart series must say which of the three kinds it is — passing a bare `{ts, value}[]`
 * anywhere a `LabelledSeries` is expected is a type error, there is no way to mix series without
 * a label (05.3's own done-criterion; rule I12: Historical, Model and Measured are never mixed).
 */
export type LabelledSeries =
  | { readonly label: 'Historical'; readonly points: readonly ChartPoint[] }
  | { readonly label: 'Model'; readonly points: readonly ChartPoint[] }
  | { readonly label: 'Measured'; readonly points: readonly ChartPoint[] };
