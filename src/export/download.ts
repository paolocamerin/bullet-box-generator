// `data`'s real-world shape is always a valid Blob source (string, or an
// ArrayBuffer/typed-array/DataView from an exporter). TS's strict typed-array
// generics (ArrayBufferLike vs. ArrayBuffer) reject some of these at the
// `BlobPart` boundary even though the runtime Blob constructor accepts them
// fine, hence the single explicit cast below.
export function triggerDownload(
  data: string | ArrayBufferView | ArrayBuffer,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
