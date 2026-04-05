import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConversationReadMarker } from "./ConversationReadMarker";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ThreadRow = {
  conversation_id: string;
  partner_user_id: string;
  partner_name: string;
  partner_email: string;
  last_message_body: string | null;
  last_message_at: string;
  unread_count: number;
};

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ContactRow = {
  user_id: string;
  display_name: string;
  email: string;
  user_kind: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_role: string | null;
  recipient_group: string;
};

function buildMessagesUrl(params: {
  conversationId?: string;
  error?: string;
  success?: string;
}) {
  const query = new URLSearchParams();

  if (params.conversationId) query.set("conversation", params.conversationId);
  if (params.error) query.set("error", params.error);
  if (params.success) query.set("success", params.success);

  const queryString = query.toString();
  return queryString ? `/messages?${queryString}` : "/messages";
}

async function sendDirectMessage(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const recipientId = String(formData.get("recipientId") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const conversationId = String(formData.get("conversationId") || "").trim();

  if (!recipientId || !body) {
    redirect(
      buildMessagesUrl({
        conversationId: conversationId || undefined,
        error: "Recipient and message body are required.",
      }),
    );
  }

  const { data, error } = await supabase.rpc("send_direct_message", {
    target_user_id: recipientId,
    body,
  });

  const response = data as {
    conversation_id?: string;
    message_id?: string;
  } | null;

  if (error || !response?.conversation_id) {
    redirect(
      buildMessagesUrl({
        conversationId: conversationId || undefined,
        error: error?.message || "Unable to send message.",
      }),
    );
  }

  revalidatePath("/messages");
  redirect(
    buildMessagesUrl({
      conversationId: response.conversation_id,
      success: "Message sent.",
    }),
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const conversationId = resolvedSearchParams.conversation?.trim() ?? "";
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [threadsResult, contactsResult] = await Promise.all([
    supabase.rpc("message_threads"),
    supabase.rpc("messaging_contacts", {
      p_search: null,
      p_tenant_id: null,
      p_role: null,
      p_kind: null,
    }),
  ]);

  const threads = (threadsResult.data ?? []) as ThreadRow[];
  const contacts = (contactsResult.data ?? []) as ContactRow[];

  const activeThread = conversationId
    ? (threads.find((thread) => thread.conversation_id === conversationId) ??
      null)
    : null;

  if (conversationId && !activeThread) {
    redirect(buildMessagesUrl({ error: "Conversation not found." }));
  }

  const activeConversationId = activeThread?.conversation_id ?? conversationId;
  const messagesResult = activeConversationId
    ? await supabase
        .from("message_thread_messages")
        .select("id,sender_id,body,created_at")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] as MessageRow[] };

  const messages = (messagesResult.data ?? []) as MessageRow[];
  const errorMessage = resolvedSearchParams.error ?? null;
  const successMessage = resolvedSearchParams.success ?? null;
  const groupedContacts = Array.from(
    new Set(contacts.map((contact) => contact.recipient_group)),
  );
  const unreadThreadsCount = threads.filter(
    (thread) => thread.unread_count > 0,
  ).length;

  function formatMessageTime(value: string) {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <article
        className="card"
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
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <aside
          className="card"
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
            <textarea
              className="field"
              name="body"
              rows={4}
              maxLength={4000}
              placeholder="Write a secure message"
              required
            />
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
          className="card"
          style={{
            padding: 18,
            minHeight: 640,
            background: "linear-gradient(180deg, #ffffff 0%, #f8fcfd 100%)",
            borderRadius: 22,
          }}
        >
          {activeThread ? (
            <div style={{ display: "grid", gap: 14, height: "100%" }}>
              <ConversationReadMarker
                conversationId={activeThread.conversation_id}
              />

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
                  const isMine = message.sender_id === user.id;
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
              </div>

              <form
                action={sendDirectMessage}
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
                <textarea
                  className="field"
                  name="body"
                  rows={3}
                  maxLength={4000}
                  placeholder="Reply securely"
                  required
                />
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
