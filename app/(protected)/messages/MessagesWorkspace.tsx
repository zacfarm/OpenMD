"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";

export type ThreadRow = {
  conversation_id: string;
  partner_user_id: string;
  partner_name: string;
  partner_email: string;
  last_message_body: string | null;
  last_message_at: string;
  unread_count: number;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_name: string | null;
  attachment_path: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  attachment_signed_url: string | null;
};

export type ContactRow = {
  user_id: string;
  display_name: string;
  email: string;
  user_kind: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_role: string | null;
  recipient_group: string;
};

type Props = {
  initialThreads: ThreadRow[];
  initialMessages: MessageRow[];
  contacts: ContactRow[];
  activeConversationId: string;
  userId: string;
  sendDirectMessage: (formData: FormData) => Promise<void>;
  errorMessage: string | null;
  successMessage: string | null;
};

export function MessagesWorkspace({
  initialThreads,
  initialMessages,
  contacts,
  activeConversationId,
  userId,
  sendDirectMessage,
  errorMessage,
  successMessage,
}: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState(initialMessages);
  const [composeAttachmentName, setComposeAttachmentName] = useState<
    string | null
  >(null);
  const [replyAttachmentName, setReplyAttachmentName] = useState<string | null>(
    null,
  );
  const [composeAttachmentMenuOpen, setComposeAttachmentMenuOpen] =
    useState(false);
  const [replyAttachmentMenuOpen, setReplyAttachmentMenuOpen] = useState(false);
  const [composeAttachmentAccept, setComposeAttachmentAccept] = useState(
    ".pdf,.doc,.docx,.txt,.xls,.xlsx",
  );
  const [replyAttachmentAccept, setReplyAttachmentAccept] = useState(
    ".pdf,.doc,.docx,.txt,.xls,.xlsx",
  );
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composeAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const replyAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, activeConversationId]);

  const activeThread = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      threads.find(
        (thread) => thread.conversation_id === activeConversationId,
      ) ?? null
    );
  }, [activeConversationId, threads]);

  const groupedContacts = useMemo(
    () =>
      Array.from(new Set(contacts.map((contact) => contact.recipient_group))),
    [contacts],
  );

  const resolveAttachmentUrls = useCallback(async (rows: MessageRow[]) => {
    const supabase = createSupabaseBrowserClient();

    return Promise.all(
      rows.map(async (message) => {
        if (!message.attachment_path) {
          return { ...message, attachment_signed_url: null };
        }

        const { data } = await supabase.storage
          .from(MESSAGE_ATTACHMENT_BUCKET)
          .createSignedUrl(message.attachment_path, 60 * 60);

        return {
          ...message,
          attachment_signed_url: data?.signedUrl ?? null,
        };
      }),
    );
  }, []);

  const refreshThreads = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.rpc("message_threads");

    if (Array.isArray(data)) {
      setThreads(data as ThreadRow[]);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("message_thread_messages")
      .select(
        "id,sender_id,body,created_at,attachment_name,attachment_path,attachment_mime_type,attachment_size_bytes",
      )
      .eq("conversation_id", activeConversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    const resolvedMessages = await resolveAttachmentUrls(
      (data ?? []) as MessageRow[],
    );

    setMessages(resolvedMessages);
  }, [activeConversationId, resolveAttachmentUrls]);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      const supabase = createSupabaseBrowserClient();

      await supabase
        .from("message_conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      setThreads((current) =>
        current.map((thread) =>
          thread.conversation_id === conversationId
            ? { ...thread, unread_count: 0 }
            : thread,
        ),
      );
    },
    [userId],
  );

  useEffect(() => {
    if (!activeConversationId) return;

    void markConversationRead(activeConversationId);
  }, [activeConversationId, markConversationRead]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_thread_messages",
        },
        (payload) => {
          const newMessage = payload.new as MessageRow & {
            conversation_id: string;
          };

          void refreshThreads();

          if (newMessage.conversation_id === activeConversationId) {
            void refreshMessages();
            if (newMessage.sender_id !== userId) {
              void markConversationRead(newMessage.conversation_id);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_conversation_participants",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshThreads();

          if (activeConversationId) {
            void refreshMessages();
          }
        },
      )
      .subscribe();

    void refreshThreads();
    if (activeConversationId) {
      void refreshMessages();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    activeConversationId,
    markConversationRead,
    refreshMessages,
    refreshThreads,
    userId,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, activeConversationId]);

  const unreadThreadsCount = threads.filter(
    (thread) => thread.unread_count > 0,
  ).length;

  function formatFileSize(bytes: number | null) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleAttachmentChange(
    event: ChangeEvent<HTMLInputElement>,
    setAttachmentName: (value: string | null) => void,
  ) {
    const file = event.target.files?.[0] ?? null;
    setAttachmentName(file ? file.name : null);
  }

  function AttachmentMenu({
    open,
    onToggle,
    onPickFile,
    onPickImage,
  }: {
    open: boolean;
    onToggle: () => void;
    onPickFile: () => void;
    onPickImage: () => void;
  }) {
    return (
      <div style={{ position: "relative", alignSelf: "end" }}>
        <button
          type="button"
          aria-label="Attach file or picture"
          onClick={onToggle}
          className="btn btn-secondary"
          style={{
            minWidth: 44,
            height: 44,
            padding: 0,
            borderRadius: 999,
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          +
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: "calc(100% + 10px)",
              display: "grid",
              gap: 6,
              minWidth: 180,
              padding: 8,
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "#fff",
              boxShadow: "0 14px 30px rgba(12, 46, 36, 0.12)",
              zIndex: 5,
            }}
          >
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onPickFile}
            >
              Attach file
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onPickImage}
            >
              Attach picture
            </button>
          </div>
        )}
      </div>
    );
  }

  function formatMessageTime(value: string) {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <section className="msg-page" style={{ display: "grid", gap: 20 }}>
      <article
        className="card msg-hero"
        style={{
          padding: 26,
          background:
            "radial-gradient(circle at 82% 12%, rgba(12, 122, 90, 0.24), transparent 34%), radial-gradient(circle at 10% 86%, rgba(184, 118, 23, 0.12), transparent 30%), linear-gradient(145deg, #fbfffd 0%, #ffffff 66%, #eef6ff 100%)",
          borderRadius: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              className="eyebrow"
              style={{ marginBottom: 8, letterSpacing: "0.12em" }}
            >
              Secure collaboration
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.9rem, 3.2vw, 2.6rem)",
                lineHeight: 1.05,
              }}
            >
              Messages
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                color: "var(--muted)",
                maxWidth: 760,
              }}
            >
              Reach providers, facilities, billers, and schedulers in one
              encrypted workflow. Only conversation participants can read a
              thread.
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              <span
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  padding: "5px 10px",
                  fontSize: 12,
                  background: "rgba(255,255,255,0.85)",
                }}
              >
                {contacts.length} recipients
              </span>
              <span
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  padding: "5px 10px",
                  fontSize: 12,
                  background: "rgba(255,255,255,0.85)",
                }}
              >
                {threads.length} conversations
              </span>
            </div>
          </div>
          <div
            className="dashboard-mini-stat"
            style={{ minWidth: 220, borderRadius: 16 }}
          >
            <p className="metric-label">Unread Threads</p>
            <p style={{ margin: "8px 0 0", fontWeight: 700, fontSize: 24 }}>
              {unreadThreadsCount}
            </p>
          </div>
        </div>

        {errorMessage && (
          <p
            style={{
              margin: "14px 0 0",
              color: "var(--warning)",
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p
            style={{
              margin: "14px 0 0",
              color: "var(--accent-strong)",
              fontWeight: 600,
            }}
          >
            {successMessage}
          </p>
        )}
      </article>

      <div
        className="msg-layout"
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <aside
          className="card msg-sidebar"
          style={{
            padding: 18,
            display: "grid",
            gap: 16,
            background: "linear-gradient(180deg, #ffffff 0%, #f7fcf9 100%)",
            borderRadius: 20,
          }}
        >
          <form
            action={sendDirectMessage}
            encType="multipart/form-data"
            style={{
              display: "grid",
              gap: 10,
              padding: 12,
              border: "1px solid var(--line)",
              borderRadius: 14,
              background: "var(--surface-soft)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>
                Start a message
              </h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Pick a recipient group and start a private thread.
              </p>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              Recipient
              <select
                className="field"
                name="recipientId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select a user
                </option>
                {groupedContacts.map((group) => (
                  <optgroup key={group} label={group}>
                    {contacts
                      .filter((contact) => contact.recipient_group === group)
                      .map((contact) => (
                        <option
                          key={`${contact.user_id}-${contact.tenant_id ?? "global"}-${contact.tenant_role ?? "none"}`}
                          value={contact.user_id}
                        >
                          {contact.display_name}
                          {contact.tenant_name
                            ? ` · ${contact.tenant_name}`
                            : ""}
                          {contact.tenant_role
                            ? ` (${contact.tenant_role})`
                            : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "end",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Message
                </span>
                <textarea
                  className="field"
                  name="body"
                  rows={4}
                  maxLength={4000}
                  placeholder="Write a secure message"
                  required
                />
              </div>
              <AttachmentMenu
                open={composeAttachmentMenuOpen}
                onToggle={() =>
                  setComposeAttachmentMenuOpen((current) => !current)
                }
                onPickFile={() => {
                  setComposeAttachmentMenuOpen(false);
                  setComposeAttachmentAccept(".pdf,.doc,.docx,.txt,.xls,.xlsx");
                  composeAttachmentInputRef.current?.click();
                }}
                onPickImage={() => {
                  setComposeAttachmentMenuOpen(false);
                  setComposeAttachmentAccept("image/*");
                  composeAttachmentInputRef.current?.click();
                }}
              />
            </div>
            <input
              ref={composeAttachmentInputRef}
              type="file"
              name="attachment"
              accept={composeAttachmentAccept}
              style={{ display: "none" }}
              onChange={(event) =>
                handleAttachmentChange(event, setComposeAttachmentName)
              }
            />
            {composeAttachmentName && (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Attached: {composeAttachmentName}
              </p>
            )}
            <button className="btn btn-primary" type="submit">
              Send secure message
            </button>
          </form>

          <div style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Conversations</h2>
            {threads.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                No conversations yet. Use the form above to start one.
              </p>
            ) : (
              <div
                className="msg-thread-list"
                style={{
                  display: "grid",
                  gap: 8,
                  maxHeight: 520,
                  overflow: "auto",
                  paddingRight: 4,
                }}
              >
                {threads.map((thread) => {
                  const isActive =
                    thread.conversation_id === activeConversationId;

                  return (
                    <Link
                      key={thread.conversation_id}
                      href={`/messages?conversation=${thread.conversation_id}`}
                      className="card"
                      style={{
                        padding: 12,
                        textDecoration: "none",
                        borderColor: isActive ? "var(--accent)" : "var(--line)",
                        background: isActive
                          ? "linear-gradient(145deg, rgba(12, 122, 90, 0.13), rgba(12, 122, 90, 0.03))"
                          : "var(--surface-soft)",
                        display: "grid",
                        gap: 4,
                        borderRadius: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "baseline",
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>
                          {thread.partner_name}
                        </strong>
                        {thread.unread_count > 0 && (
                          <span className="app-notification-count">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--muted)",
                          fontSize: 13,
                        }}
                      >
                        {thread.partner_email}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 13,
                          color: "var(--muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {thread.last_message_body || "No messages yet"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main
          className="card msg-thread-panel"
          style={{
            padding: 18,
            minHeight: 640,
            background: "linear-gradient(180deg, #ffffff 0%, #f8fcfd 100%)",
            borderRadius: 22,
          }}
        >
          {activeThread ? (
            <div style={{ display: "grid", gap: 14, height: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <div className="eyebrow">Thread</div>
                  <h2 style={{ margin: "4px 0 2px", fontSize: 24 }}>
                    {activeThread.partner_name}
                  </h2>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    {activeThread.partner_email}
                  </p>
                </div>
                <div
                  className="dashboard-mini-stat"
                  style={{ minWidth: 190, borderRadius: 14 }}
                >
                  <p className="metric-label">Unread messages</p>
                  <p style={{ margin: "8px 0 0", fontWeight: 700 }}>
                    {activeThread.unread_count}
                  </p>
                </div>
              </div>

              <div
                className="msg-bubble-stream"
                style={{
                  display: "grid",
                  gap: 12,
                  maxHeight: 440,
                  overflow: "auto",
                  paddingRight: 6,
                  alignContent: "start",
                }}
              >
                {messages.map((message) => {
                  const isMine = message.sender_id === userId;

                  return (
                    <article
                      key={message.id}
                      style={{
                        justifySelf: isMine ? "end" : "start",
                        maxWidth: "74%",
                        padding: "12px 15px",
                        borderRadius: isMine
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        background: isMine
                          ? "linear-gradient(150deg, rgba(12, 122, 90, 0.22), rgba(12, 122, 90, 0.08))"
                          : "linear-gradient(150deg, #ffffff, #f4f9f7)",
                        border: "1px solid var(--line)",
                        boxShadow: "0 8px 18px rgba(12, 46, 36, 0.08)",
                      }}
                    >
                      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                        {message.body}
                      </p>
                      {message.attachment_name && (
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: "1px solid rgba(12, 46, 36, 0.12)",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <a
                            href={message.attachment_signed_url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontWeight: 600,
                              color: "var(--accent-strong)",
                              textDecoration: "none",
                            }}
                          >
                            {message.attachment_name}
                          </a>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: "var(--muted)",
                            }}
                          >
                            Attached file
                            {message.attachment_size_bytes
                              ? ` · ${formatFileSize(message.attachment_size_bytes)}`
                              : ""}
                          </p>
                        </div>
                      )}
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 12,
                          color: "var(--muted)",
                        }}
                      >
                        {formatMessageTime(message.created_at)}
                      </p>
                    </article>
                  );
                })}
                {!messages.length && (
                  <p style={{ margin: 0, color: "var(--muted)" }}>
                    No messages yet. Send the first one below.
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                className="msg-reply-form"
                action={sendDirectMessage}
                encType="multipart/form-data"
                style={{
                  display: "grid",
                  gap: 10,
                  marginTop: "auto",
                  paddingTop: 12,
                  borderTop: "1px solid var(--line)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.85), #ffffff)",
                }}
              >
                <input
                  type="hidden"
                  name="conversationId"
                  value={activeThread.conversation_id}
                />
                <input
                  type="hidden"
                  name="recipientId"
                  value={activeThread.partner_user_id}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      Reply
                    </span>
                    <textarea
                      className="field"
                      name="body"
                      rows={3}
                      maxLength={4000}
                      placeholder="Reply securely"
                      required
                    />
                  </div>
                  <AttachmentMenu
                    open={replyAttachmentMenuOpen}
                    onToggle={() =>
                      setReplyAttachmentMenuOpen((current) => !current)
                    }
                    onPickFile={() => {
                      setReplyAttachmentMenuOpen(false);
                      setReplyAttachmentAccept(
                        ".pdf,.doc,.docx,.txt,.xls,.xlsx",
                      );
                      replyAttachmentInputRef.current?.click();
                    }}
                    onPickImage={() => {
                      setReplyAttachmentMenuOpen(false);
                      setReplyAttachmentAccept("image/*");
                      replyAttachmentInputRef.current?.click();
                    }}
                  />
                </div>
                <input
                  ref={replyAttachmentInputRef}
                  type="file"
                  name="attachment"
                  accept={replyAttachmentAccept}
                  style={{ display: "none" }}
                  onChange={(event) =>
                    handleAttachmentChange(event, setReplyAttachmentName)
                  }
                />
                {replyAttachmentName && (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    Attached: {replyAttachmentName}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                    Messages stay between you and {activeThread.partner_name}.
                  </p>
                  <button className="btn btn-primary" type="submit">
                    Send reply
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div
              style={{
                minHeight: 520,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                color: "var(--muted)",
                padding: 24,
              }}
            >
              <div style={{ maxWidth: 520 }}>
                <div className="eyebrow">No active conversation</div>
                <h2 style={{ margin: "10px 0 6px", color: "var(--ink)" }}>
                  Start a private thread
                </h2>
                <p style={{ margin: 0 }}>
                  Choose a recipient from the left panel and send your first
                  secure message.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
