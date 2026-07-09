import { HelmetDataContext } from "@dr.pogodin/react-helmet";
import { Transform } from "stream";
import { ServerStyleSheet } from "styled-components";

export function head({ helmetContext }: { helmetContext?: HelmetDataContext }) {
  if (!helmetContext) return "";
  return [
    helmetContext.helmet?.title?.toString(),
    helmetContext.helmet?.priority?.toString(),
    helmetContext.helmet?.meta?.toString(),
    helmetContext.helmet?.link?.toString(),
    helmetContext.helmet?.script?.toString(),
    helmetContext.helmet?.style?.toString(),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Creates a transform stream that injects CSS styles from styled-components
 * into the HTML stream.
 */
export function transform({ sheet }: { sheet: ServerStyleSheet }) {
  if (!sheet?._emitSheetCSS || !sheet?.instance?.clearTag) {
    throw new Error("Invalid ServerStyleSheet instance from serverModule");
  }

  const decoder = new TextDecoder("utf-8");

  return new Transform({
    transform(chunk, encoding, callback) {
      // Convert the chunk to a string
      const renderedHtmlChunk =
        chunk instanceof Uint8Array
          ? decoder.decode(chunk, { stream: true })
          : chunk.toString(encoding || "utf8");

      // Extract CSS styles and clear the tag for the next chunk
      const stylesToInject = sheet._emitSheetCSS();
      sheet.instance.clearTag();

      // Push the combined styles and HTML chunk to the output stream
      this.push(stylesToInject + renderedHtmlChunk);
      callback();
    },
  });
}
