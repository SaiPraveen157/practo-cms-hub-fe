"use client"

import { useCallback, useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Pilcrow,
  List,
  ListOrdered,
} from "lucide-react"

export interface ScriptRichTextEditorProps {
  /** Initial HTML content (used on mount and when id changes). */
  initialContent?: string
  /** Called when content changes (HTML string). */
  onChange?: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Min height of the editable area (default 240px). */
  minHeight?: string
}

function getExtensions(placeholderText: string) {
  return [
    StarterKit,
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "text-primary underline underline-offset-2" },
    }),
    Placeholder.configure({ placeholder: placeholderText }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
  ]
}

export function ScriptRichTextEditor({
  initialContent = "",
  onChange,
  placeholder = "Enter the full script content…",
  disabled = false,
  className,
  minHeight = "240px",
}: ScriptRichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: getExtensions(placeholder),
    content: initialContent || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "min-h-[200px] focus:outline-none px-3 py-2 text-sm leading-relaxed [&_p]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  const setContent = useCallback(
    (html: string) => {
      editor?.commands.setContent(html || "<p></p>")
    },
    [editor]
  )

  useEffect(() => {
    setContent(initialContent || "<p></p>")
  }, [initialContent, setContent])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-lg border border-input bg-background animate-pulse",
          className
        )}
        style={{ minHeight }}
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-input bg-background overflow-hidden",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 p-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo2 className="size-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive("paragraph")}
          title="Paragraph"
        >
          <Pilcrow className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <span className="text-xs font-bold">H1</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <span className="text-xs font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <span className="text-xs font-bold">H3</span>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          isActive={editor.isActive({ textAlign: "justify" })}
          title="Justify"
        >
          <AlignJustify className="size-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Ordered list"
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("URL")
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          isActive={editor.isActive("link")}
          title="Insert link"
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>
      </div>
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 w-px self-stretch bg-border" />
}

function ToolbarButton({
  children,
  onClick,
  isActive,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8 shrink-0", isActive && "bg-muted")}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  )
}
