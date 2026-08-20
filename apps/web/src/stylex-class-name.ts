import * as stylex from "@stylexjs/stylex";
import type { CompiledStyles, InlineStyles, StyleXArray } from "@stylexjs/stylex";

type StyleArg = StyleXArray<
  (null | undefined | CompiledStyles) | boolean | Readonly<[CompiledStyles, InlineStyles]>
>;

export function stylexClassName(...styles: ReadonlyArray<StyleArg>): string | undefined {
  return stylex.props(...styles).className;
}
