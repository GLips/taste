/**
 * Decode-time cleanup for caller-typed input (CLI flags, stdin JSON, the review UI). Text is trimmed,
 * and a blank optional value decodes to an absent key, so a record never carries an empty field.
 * Optional fields accept `undefined` too, so callers can pass an unset flag straight through.
 */
import { Option, Schema, SchemaTransformation } from "effect";

/** Required text, trimmed. Emptiness is the record schema's call, so its message names the field. */
export const TrimmedText = Schema.Trim;

const trimToPresent = (value: string | undefined): Option.Option<string> => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? Option.none() : Option.some(trimmed);
};

/** Optional text: trimmed, and absent when blank or undefined. */
export const OptionalTrimmedText = Schema.optional(Schema.String).pipe(
  Schema.decodeTo(
    Schema.optionalKey(Schema.String),
    SchemaTransformation.transformOptional({
      decode: (input) => Option.flatMap(input, trimToPresent),
      encode: (output) => output,
    }),
  ),
);

const trimList = (values: ReadonlyArray<string>): Array<string> =>
  values.flatMap((value) => Option.toArray(trimToPresent(value)));

/** A required list: each entry trimmed, blank entries dropped. */
export const TrimmedTextList = Schema.Array(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Array(Schema.String),
    SchemaTransformation.transform<ReadonlyArray<string>, ReadonlyArray<string>>({ decode: trimList, encode: (values) => values }),
  ),
);

/** An optional list: entries trimmed, blanks dropped, and absent when nothing is left. */
export const OptionalTrimmedTextList = Schema.optional(Schema.Array(Schema.String)).pipe(
  Schema.decodeTo(
    Schema.optionalKey(Schema.Array(Schema.String)),
    SchemaTransformation.transformOptional({
      decode: (input) =>
        Option.flatMap(input, (values) => {
          const kept = trimList(values ?? []);
          return kept.length > 0 ? Option.some(kept) : Option.none();
        }),
      encode: (output) => output,
    }),
  ),
);

/** An optional choice from a closed set; `undefined` decodes to an absent key. */
export const optionalInputChoice = <const Choices extends ReadonlyArray<string>>(choices: Choices) =>
  Schema.optional(Schema.Literals(choices)).pipe(
    Schema.decodeTo(
      Schema.optionalKey(Schema.Literals(choices)),
      SchemaTransformation.transformOptional<Choices[number], Choices[number] | undefined>({
        decode: (input) => Option.flatMap(input, Option.fromUndefinedOr),
        encode: (output) => output,
      }),
    ),
  );
