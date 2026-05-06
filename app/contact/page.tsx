"use client";

import { useState } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<null | string>(null);
  const [error, setError] = useState<null | string>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send message");
      } else {
        setSuccess("Message sent — we will get back to you soon.");
        setName("");
        setEmail("");
        setMessage("");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold mb-4">Contact Us</h1>
      <p className="mb-6">Fill out the form below to reach our team.</p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            type="text"
            name="name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            type="email"
            name="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            name="message"
            rows={6}
            required
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </form>
    </div>
  );
}
