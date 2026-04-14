import JSZip from "jszip";

type SupabaseSignedUrlResult = {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
};

type SupabaseStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<SupabaseSignedUrlResult>;
    };
  };
};

export type ExportableCredentialDocument = {
  id: string;
  documentName: string;
  storagePath: string;
  credentialType?: string;
  providerName?: string;
  status?: string;
  uploadedAt?: string;
  expiresOn?: string | null;
};

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function inferExtension(path: string): string {
  const maybeExt = path.split(".").pop();
  if (!maybeExt || maybeExt === path) return "";
  return maybeExt.toLowerCase();
}

function ensureExtension(fileName: string, path: string): string {
  if (fileName.includes(".")) return fileName;
  const ext = inferExtension(path);
  return ext ? `${fileName}.${ext}` : fileName;
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function fetchBlob(signedUrl: string): Promise<Blob> {
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }
  return response.blob();
}

async function getSignedUrl(
  supabase: SupabaseStorageClient,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("credentials")
    .createSignedUrl(storagePath, 120);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create a signed URL.");
  }

  return data.signedUrl;
}

function buildExportFileName(
  doc: ExportableCredentialDocument,
  index: number,
): string {
  const baseName = sanitizeFileName(
    doc.documentName || `document-${index + 1}`,
  );
  const prefixed = doc.providerName
    ? `${sanitizeFileName(doc.providerName)}_${baseName}`
    : baseName;
  return ensureExtension(prefixed, doc.storagePath);
}

function makeUniqueFileName(fileName: string, usedNames: Set<string>): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf(".");
  const hasExt = dotIndex > 0;
  const base = hasExt ? fileName.slice(0, dotIndex) : fileName;
  const ext = hasExt ? fileName.slice(dotIndex) : "";

  let attempt = 2;
  while (true) {
    const candidate = `${base} (${attempt})${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    attempt += 1;
  }
}

function buildManifestCsv(docs: ExportableCredentialDocument[]): string {
  const rows = [
    [
      "index",
      "id",
      "providerName",
      "documentName",
      "credentialType",
      "status",
      "uploadedAt",
      "expiresOn",
      "storagePath",
    ],
  ];

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    rows.push([
      String(i + 1),
      doc.id,
      doc.providerName ?? "",
      doc.documentName,
      doc.credentialType ?? "",
      doc.status ?? "",
      doc.uploadedAt ?? "",
      doc.expiresOn ?? "",
      doc.storagePath,
    ]);
  }

  const escapeCsv = (value: string) => {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  return rows
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
}

export async function downloadCredentialDocument(params: {
  supabase: SupabaseStorageClient;
  document: ExportableCredentialDocument;
  index?: number;
}) {
  const { supabase, document, index = 0 } = params;
  const signedUrl = await getSignedUrl(supabase, document.storagePath);
  const blob = await fetchBlob(signedUrl);
  const fileName = buildExportFileName(document, index);
  triggerDownload(blob, fileName);
}

export async function exportCredentialDocuments(params: {
  supabase: SupabaseStorageClient;
  documents: ExportableCredentialDocument[];
  onProgress?: (progress: {
    current: number;
    total: number;
    fileName: string;
  }) => void;
}) {
  const { supabase, documents, onProgress } = params;

  if (documents.length === 0) {
    throw new Error("No documents available to export.");
  }

  const zip = new JSZip();
  const docsFolder = zip.folder("documents");
  if (!docsFolder) {
    throw new Error("Unable to initialize ZIP export.");
  }

  const failed: string[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < documents.length; i += 1) {
    const doc = documents[i];
    const fileName = makeUniqueFileName(buildExportFileName(doc, i), usedNames);
    onProgress?.({ current: i + 1, total: documents.length, fileName });

    try {
      const signedUrl = await getSignedUrl(supabase, doc.storagePath);
      const blob = await fetchBlob(signedUrl);
      docsFolder.file(fileName, blob);
    } catch {
      failed.push(fileName);
    }
  }

  const manifest = buildManifestCsv(documents);
  zip.file("manifest.csv", manifest);
  zip.file(
    "summary.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        total: documents.length,
        successful: documents.length - failed.length,
        failed,
      },
      null,
      2,
    ),
  );

  const archive = await zip.generateAsync({ type: "blob" });
  triggerDownload(archive, `credentials-export-${timestampSuffix()}.zip`);

  return {
    total: documents.length,
    failed,
  };
}
