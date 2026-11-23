import * as Y from "yjs";
type Node = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Node[] };
type Element = Y.XmlElement;
const elements = (nodes: Node[]): (Element | Y.XmlText)[] => {
  const result: (Element | Y.XmlText)[] = [];
  for (let index = 0; index < nodes.length;) {
    const node = nodes[index];
    if (node.type === "text") {
      const text = new Y.XmlText();
      const delta: { insert: string; attributes: Record<string, unknown> }[] = [];
      while (nodes[index]?.type === "text") {
        const part = nodes[index++];
        delta.push({ insert: part.text ?? "", attributes: Object.fromEntries((part.marks ?? []).map((mark) => [mark.type, mark.attrs ?? {}])) });
      }
      text.applyDelta(delta); result.push(text);
    } else {
      index++;
      const element = new Y.XmlElement(node.type);
      for (const [key, value] of Object.entries(node.attrs ?? {}))
        // TipTap uses JSON attributes; the Yjs XML declaration defaults to strings.
        if (value !== null && key !== "ychange") element.setAttribute(key, value as string);
      element.insert(0, elements(node.content ?? [])); result.push(element);
    }
  }
  return result;
};
export const replaceDocumentJson = (doc: Y.Doc, content: Record<string, unknown>) => {
  const root = content as Node;
  if (root.type !== "doc" || (root.content && !Array.isArray(root.content))) throw new Error("Invalid document root");
  doc.transact(() => {
    const fragment = doc.getXmlFragment("content");
    fragment.delete(0, fragment.length);
    fragment.insert(0, elements(root.content ?? []));
  });
};
export const documentJson = (doc: Y.Doc): Record<string, unknown> => {
  const serialize = (item: Y.XmlElement | Y.XmlText): Node[] => {
    if (item instanceof Y.XmlText) return (item.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[])
      .filter((part) => typeof part.insert === "string" && part.insert.length).map((part) => ({
      type: "text", text: part.insert as string,
      ...(Object.keys(part.attributes ?? {}).length ? { marks: Object.entries(part.attributes ?? {}).map(([key, attrs]) => ({
        type: key.replace(/--[A-Za-z0-9+/=]{8}$/, ""), attrs: attrs as Record<string, unknown>
      })) } : {})
    }));
    const attrs = item.getAttributes();
    const children = item.toArray().flatMap((child) => serialize(child as Y.XmlElement | Y.XmlText));
    return [{ type: item.nodeName, ...(Object.keys(attrs).length ? { attrs } : {}), ...(children.length ? { content: children } : {}) }];
  };
  return { type: "doc", content: doc.getXmlFragment("content").toArray().flatMap((item) => serialize(item as Y.XmlElement | Y.XmlText)) };
};
