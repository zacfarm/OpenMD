export default function HipaaPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-semibold mb-4">HIPAA & Compliance</h1>
      <p className="mb-4">
        We take patient privacy and HIPAA compliance seriously. For questions or
        to file a complaint, please contact our compliance team.
      </p>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>
          Email:{" "}
          <a href="mailto:compliance@openmd.com" className="text-blue-600">
            compliance@openmd.com
          </a>
        </li>
        <li>
          Report a privacy concern:{" "}
          <a href="/contact" className="text-blue-600">
            Submit here
          </a>
        </li>
        <li>
          Read our{" "}
          <a href="/privacy" className="text-blue-600">
            Privacy Policy
          </a>{" "}
          for details
        </li>
      </ul>
    </div>
  );
}
