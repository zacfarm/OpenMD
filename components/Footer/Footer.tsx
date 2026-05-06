import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-200 border-t border-slate-800 mt-8">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">OpenMD</h3>
          <p className="text-sm text-slate-400">Healthcare marketplace</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-6">
          <div>
            <h4 className="font-medium">Support</h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link
                  href="/contact"
                  className="text-slate-300 hover:text-white"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/hipaa" className="text-slate-300 hover:text-white">
                  HIPAA Compliance
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Company</h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="text-slate-300 hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-slate-300 hover:text-white">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Follow</h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <a
                  href="https://twitter.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-300 hover:text-white"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-300 hover:text-white"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-sm text-slate-400">
          © {new Date().getFullYear()} OpenMD. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
