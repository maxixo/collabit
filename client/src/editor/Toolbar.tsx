import type { Editor } from "@tiptap/react";

type ToolbarProps = {
  editor: Editor | null;
  className?: string;
  onRequestLink?: () => void;
};

type ToolbarButtonIcon =
  | { type: "icon"; value: string }
  | { type: "text"; value: string };

type ToolbarButtonProps = {
  editor: Editor | null;
  icon: ToolbarButtonIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

const buttonClassName = (active: boolean, disabled: boolean) => {
  const base = "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors";

  if (disabled) {
    return `${base} cursor-not-allowed text-[#b7b8d9] opacity-60`;
  }

  if (active) {
    return `${base} bg-background-light text-primary dark:bg-primary/20 dark:text-white`;
  }

  return `${base} text-[#4c4d9a] hover:bg-background-light hover:text-primary dark:text-[#8a8bbd] dark:hover:bg-primary/20`;
};

const ToolbarButton = ({ editor, icon, label, active = false, disabled = false, onClick }: ToolbarButtonProps) => {
  const isDisabled = disabled || !editor;

  return (
    <button
      className={buttonClassName(active, isDisabled)}
      type="button"
      disabled={isDisabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon.type === "icon" ? (
        <span className="material-symbols-outlined text-[20px]">{icon.value}</span>
      ) : (
        <span className="text-xs font-semibold tracking-[0.08em]">{icon.value}</span>
      )}
    </button>
  );
};

const Divider = () => <div className="mx-1 h-6 w-px bg-[#e7e7f3] dark:bg-[#2d2e4a]"></div>;

export const Toolbar = ({ editor, className, onRequestLink }: ToolbarProps) => {
  const containerClassName = className
    ? `flex flex-wrap items-center gap-1 rounded-xl border border-[#e7e7f3] bg-white p-2 shadow-xl dark:border-[#2d2e4a] dark:bg-[#1c1d3a] ${className}`
    : "flex flex-wrap items-center gap-1 rounded-xl border border-[#e7e7f3] bg-white p-2 shadow-xl dark:border-[#2d2e4a] dark:bg-[#1c1d3a]";

  const canRun = (command: (chain: ReturnType<Editor["can"]>["chain"]) => { run: () => boolean }) => {
    if (!editor) {
      return false;
    }

    return command(editor.can().chain().focus()).run();
  };

  return (
    <div className={containerClassName}>
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_bold" }}
        label="Bold"
        active={Boolean(editor?.isActive("bold"))}
        disabled={!canRun((chain) => chain.toggleBold())}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_italic" }}
        label="Italic"
        active={Boolean(editor?.isActive("italic"))}
        disabled={!canRun((chain) => chain.toggleItalic())}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_underlined" }}
        label="Underline"
        active={Boolean(editor?.isActive("underline"))}
        disabled={!canRun((chain) => chain.toggleUnderline())}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_strikethrough" }}
        label="Strikethrough"
        active={Boolean(editor?.isActive("strike"))}
        disabled={!canRun((chain) => chain.toggleStrike())}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "ink_highlighter" }}
        label="Highlight"
        active={Boolean(editor?.isActive("highlight"))}
        disabled={!canRun((chain) => chain.toggleHighlight())}
        onClick={() => editor?.chain().focus().toggleHighlight().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "code" }}
        label="Inline code"
        active={Boolean(editor?.isActive("code"))}
        disabled={!canRun((chain) => chain.toggleCode())}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "link" }}
        label="Link"
        active={Boolean(editor?.isActive("link"))}
        disabled={!editor}
        onClick={() => onRequestLink?.()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon={{ type: "text", value: "P" }}
        label="Paragraph"
        active={Boolean(editor?.isActive("paragraph"))}
        disabled={!canRun((chain) => chain.setParagraph())}
        onClick={() => editor?.chain().focus().setParagraph().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "text", value: "H1" }}
        label="Heading 1"
        active={Boolean(editor?.isActive("heading", { level: 1 }))}
        disabled={!canRun((chain) => chain.toggleHeading({ level: 1 }))}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "text", value: "H2" }}
        label="Heading 2"
        active={Boolean(editor?.isActive("heading", { level: 2 }))}
        disabled={!canRun((chain) => chain.toggleHeading({ level: 2 }))}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "text", value: "H3" }}
        label="Heading 3"
        active={Boolean(editor?.isActive("heading", { level: 3 }))}
        disabled={!canRun((chain) => chain.toggleHeading({ level: 3 }))}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_quote" }}
        label="Blockquote"
        active={Boolean(editor?.isActive("blockquote"))}
        disabled={!canRun((chain) => chain.toggleBlockquote())}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "code" }}
        label="Code block"
        active={Boolean(editor?.isActive("codeBlock"))}
        disabled={!canRun((chain) => chain.toggleCodeBlock())}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_list_bulleted" }}
        label="Bullet list"
        active={Boolean(editor?.isActive("bulletList"))}
        disabled={!canRun((chain) => chain.toggleBulletList())}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_list_numbered" }}
        label="Numbered list"
        active={Boolean(editor?.isActive("orderedList"))}
        disabled={!canRun((chain) => chain.toggleOrderedList())}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "checklist" }}
        label="Task list"
        active={Boolean(editor?.isActive("taskList"))}
        disabled={!canRun((chain) => chain.toggleTaskList())}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_align_left" }}
        label="Align left"
        active={editor?.isActive({ textAlign: "left" }) ?? false}
        disabled={!canRun((chain) => chain.setTextAlign("left"))}
        onClick={() => editor?.chain().focus().setTextAlign("left").run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_align_center" }}
        label="Align center"
        active={editor?.isActive({ textAlign: "center" }) ?? false}
        disabled={!canRun((chain) => chain.setTextAlign("center"))}
        onClick={() => editor?.chain().focus().setTextAlign("center").run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_align_right" }}
        label="Align right"
        active={editor?.isActive({ textAlign: "right" }) ?? false}
        disabled={!canRun((chain) => chain.setTextAlign("right"))}
        onClick={() => editor?.chain().focus().setTextAlign("right").run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "format_align_justify" }}
        label="Justify"
        active={editor?.isActive({ textAlign: "justify" }) ?? false}
        disabled={!canRun((chain) => chain.setTextAlign("justify"))}
        onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "horizontal_rule" }}
        label="Horizontal rule"
        disabled={!canRun((chain) => chain.setHorizontalRule())}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "table" }}
        label="Insert table"
        active={Boolean(editor?.isActive("table"))}
        disabled={!canRun((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
        onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "add_row_below" }}
        label="Add row"
        disabled={!canRun((chain) => chain.addRowAfter())}
        onClick={() => editor?.chain().focus().addRowAfter().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "add_column_right" }}
        label="Add column"
        disabled={!canRun((chain) => chain.addColumnAfter())}
        onClick={() => editor?.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        editor={editor}
        icon={{ type: "icon", value: "delete" }}
        label="Delete table"
        disabled={!canRun((chain) => chain.deleteTable())}
        onClick={() => editor?.chain().focus().deleteTable().run()}
      />
    </div>
  );
};
