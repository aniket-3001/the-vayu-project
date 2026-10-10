/** What the assistant knows when it is asked: today's air, the day ahead, the alerts, and who is being tracked. */
export interface AssistantContext {
  readonly place: string;
  readonly aqi: number;
  readonly level: string;
  readonly pm25: number;
  /** The cleanest daylight hour ahead, if any. */
  readonly best: { readonly span: string; readonly aqi: number } | undefined;
  /** GRAP stage by our estimate, 0 for none. */
  readonly grapStage: number;
  readonly alerts: readonly string[];
  readonly fires: number | undefined;
  readonly people: readonly { readonly name: string; readonly age: number; readonly day: string }[];
}

export interface Answer {
  readonly text: string;
  /** Where the answer came from, in a few words, for the small print. */
  readonly basis: string;
  /** An audio file of the answer, when the voice service gave one (Amazon Polly). */
  readonly audioUrl?: string;
}

/** Whoever answers: the local engine now, Amazon Bedrock behind our API later. The screen does not care which. */
export interface AssistantSource {
  ask(question: string, context: AssistantContext): Promise<Answer>;
}
