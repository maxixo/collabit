import type { Editor } from "@tiptap/react";

type ToolbarProps = {
  editor: Editor | null;
  className?: string;
  onRequestLink?: () => void;
};

type ToolbarButtonProps = {
  editor: Editor | null;
  icon: string;
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

const ToolbarButton = ({ editor, icon, label, active = false, disabled = false, onClick }: ToolbarButtonProps) => (
  <button
    className={buttonClassName(active, disabled || !editor)}
    type="button"
    disabled={disabled || !editor}
    aria-label={label}
    title={label}
    aria-pressed={active}
    onClick={onClick}
  >
    <span className="material-symbols-outlined text-[20px]">{icon}</span>
  </button>
);

const Divider = () => <div className="mx-1 h-6 w-px bg-[#e7e7f3] dark:bg-[#2d2e4a]"></div>;

export const Toolbar = ({ editor, className, onRequestLink }: ToolbarProps) => {
  const containerClassName = className
    ? `flex flex-wrap items-center gap-1 rounded-xl border border-[#e7e7f3] bg-white p-2 shadow-xl dark:border-[#2d2e4a] dark:bg-[#1c1d3a] ${className}`
    : "flex flex-wrap items-center gap-1 rounded-xl border border-[#e7e7f3] bg-white p-2 shadow-xl dark:border-[#2d2e4a] dark:bg-[#1c1d3a]";

  const can = editor?.can().chain().focus();

  return (
    <div className={containerClassName}>
      <ToolbarButton
        editor={editor}
        icon="format_bold"
        label="Bold"
        active={Boolean(editor?.isActive("bold"))}
        disabled={!can?.toggleBold().run()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_italic"
        label="Italic"
        active={Boolean(editor?.isActive("italic"))}
        disabled={!can?.toggleItalic().run()}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_underlined"
        label="Underline"
        active={Boolean(editor?.isActive("underline"))}
        disabled={!can?.toggleUnderline().run()}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_strikethrough"
        label="Strikethrough"
        active={Boolean(editor?.isActive("strike"))}
        disabled={!can?.toggleStrike().run()}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="ink_highlighter"
        label="Highlight"
        active={Boolean(editor?.isActive("highlight"))}
        disabled={!can?.toggleHighlight().run()}
        onClick={() => editor?.chain().focus().toggleHighlight().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="code"
        label="Inline code"
        active={Boolean(editor?.isActive("code"))}
        disabled={!can?.toggleCode().run()}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="link"
        label="Link"
        active={Boolean(editor?.isActive("link"))}
        disabled={!editor}
        onClick={() => onRequestLink?.()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon="text_fields"
        label="Paragraph"
        active={Boolean(editor?.isActive("paragraph"))}
        disabled={!can?.setParagraph().run()}
        onClick={() => editor?.chain().focus().setParagraph().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_h1"
        label="Heading 1"
        active={Boolean(editor?.isActive("heading", { level: 1 }))}
        disabled={!can?.toggleHeading({ level: 1 }).run()}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_h2"
        label="Heading 2"
        active={Boolean(editor?.isActive("heading", { level: 2 }))}
        disabled={!can?.toggleHeading({ level: 2 }).run()}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_h3"
        label="Heading 3"
        active={Boolean(editor?.isActive("heading", { level: 3 }))}
        disabled={!can?.toggleHeading({ level: 3 }).run()}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_quote"
        label="Blockquote"
        active={Boolean(editor?.isActive("blockquote"))}
        disabled={!can?.toggleBlockquote().run()}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="code_blocks"
        label="Code block"
        active={Boolean(editor?.isActive("codeBlock"))}
        disabled={!can?.toggleCodeBlock().run()}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon="format_list_bulleted"
        label="Bullet list"
        active={Boolean(editor?.isActive("bulletList"))}
        disabled={!can?.toggleBulletList().run()}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_list_numbered"
        label="Numbered list"
        active={Boolean(editor?.isActive("orderedList"))}
        disabled={!can?.toggleOrderedList().run()}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="checklist"
        label="Task list"
        active={Boolean(editor?.isActive("taskList"))}
        disabled={!can?.toggleTaskList().run()}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon="format_align_left"
        label="Align left"
        active={editor?.isActive({ textAlign: "left" }) ?? false}
        disabled={!can?.setTextAlign("left").run()}
        onClick={() => editor?.chain().focus().setTextAlign("left").run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_align_center"
        label="Align center"
        active={editor?.isActive({ textAlign: "center" }) ?? false}
        disabled={!can?.setTextAlign("center").run()}
        onClick={() => editor?.chain().focus().setTextAlign("center").run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_align_right"
        label="Align right"
        active={editor?.isActive({ textAlign: "right" }) ?? false}
        disabled={!can?.setTextAlign("right").run()}
        onClick={() => editor?.chain().focus().setTextAlign("right").run()}
      />
      <ToolbarButton
        editor={editor}
        icon="format_align_justify"
        label="Justify"
        active={editor?.isActive({ textAlign: "justify" }) ?? false}
        disabled={!can?.setTextAlign("justify").run()}
        onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
      />

      <Divider />

      <ToolbarButton
        editor={editor}
        icon="horizontal_rule"
        label="Horizontal rule"
        disabled={!can?.setHorizontalRule().run()}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="table"
        label="Insert table"
        active={Boolean(editor?.isActive("table"))}
        disabled={!can?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      <ToolbarButton
        editor={editor}
        icon="add_row_below"
        label="Add row"
        disabled={!can?.addRowAfter().run()}
        onClick={() => editor?.chain().focus().addRowAfter().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="add_column_right"
        label="Add column"
        disabled={!can?.addColumnAfter().run()}
        onClick={() => editor?.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        editor={editor}
        icon="delete"
        label="Delete table"
        disabled={!can?.deleteTable().run()}
        onClick={() => editor?.chain().focus().deleteTable().run()}
      />
    </div>
  );
};
