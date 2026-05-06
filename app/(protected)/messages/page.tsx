import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MessagesWorkspace,
  type ContactRow,
  type MessageRow,
  type ThreadRow,
} from "./MessagesWorkspace";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";

function sanitizeAttachmentName(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, "_");
}

async function resolveMessagesWithAttachments(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  messages: MessageRow[],
) {
  return Promise.all(
    messages.map(async (message) => {
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
}

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
  const attachmentValue = formData.get("attachment");
  const attachmentFile =
    attachmentValue instanceof File && attachmentValue.size > 0
      ? attachmentValue
      : null;

  if (!recipientId || !body) {
    redirect(
      buildMessagesUrl({
        conversationId: conversationId || undefined,
        error: "Recipient and message body are required.",
      }),
    );
  }

  if (attachmentFile && attachmentFile.size > 10 * 1024 * 1024) {
    redirect(
      buildMessagesUrl({
        conversationId: conversationId || undefined,
        error: "Attachment must be smaller than 10 MB.",
      }),
    );
  }

  let attachmentStoragePath: string | null = null;
  let attachmentName: string | null = null;
  let attachmentMimeType: string | null = null;
  let attachmentSizeBytes: number | null = null;

  if (attachmentFile) {
    attachmentName = attachmentFile.name;
    attachmentMimeType = attachmentFile.type || null;
    attachmentSizeBytes = attachmentFile.size;
    attachmentStoragePath = `${user.id}/${Date.now()}_${sanitizeAttachmentName(
      attachmentFile.name,
    )}`;

    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .upload(attachmentStoragePath, attachmentFile, {
        contentType: attachmentFile.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      redirect(
        buildMessagesUrl({
          conversationId: conversationId || undefined,
          error: uploadError.message || "Unable to upload attachment.",
        }),
      );
    }
  }

  const { data, error } = await supabase.rpc("send_direct_message", {
    target_user_id: recipientId,
    body,
    attachment_storage_path: attachmentStoragePath,
    attachment_name: attachmentName,
    attachment_mime_type: attachmentMimeType,
    attachment_size_bytes: attachmentSizeBytes,
  });

  const response = data as {
    conversation_id?: string;
    message_id?: string;
  } | null;

  if (error || !response?.conversation_id) {
    if (attachmentStoragePath) {
      await supabase.storage
        .from(MESSAGE_ATTACHMENT_BUCKET)
        .remove([attachmentStoragePath]);
    }

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
        .select(
          "id,sender_id,body,created_at,attachment_name,attachment_path,attachment_mime_type,attachment_size_bytes",
        )
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] as MessageRow[] };

  const messages = await resolveMessagesWithAttachments(
    supabase,
    (messagesResult.data ?? []) as MessageRow[],
  );
  const errorMessage = resolvedSearchParams.error ?? null;
  const successMessage = resolvedSearchParams.success ?? null;

  return (
    <MessagesWorkspace
      initialThreads={threads}
      initialMessages={messages}
      contacts={contacts}
      activeConversationId={activeConversationId}
      userId={user.id}
      sendDirectMessage={sendDirectMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
    />
  );
}
