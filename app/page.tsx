import PdfHumanizerWorkspace from '@/components/PdfHumanizerWorkspace';
import DocumentAgentSuite from '@/components/DocumentAgentSuite';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Quick-Jump Bar to switch between or scroll to both complete systems */}
      <div className="w-full bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 z-40">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-semibold text-white">
            VerbaForma Complete Suite:
          </span>
          <span className="text-slate-400">
            100% Untouched Page-by-Page PDF Humanizer + Full 11-Page AI Document Generator &amp; Humanizer Agent
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#top-pdf-humanizer"
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium border border-slate-700 transition"
          >
            Page-by-Page PDF Humanizer (Original)
          </a>
          <a
            href="#ai-document-generator-agent-suite"
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition"
          >
            Jump to AI Document Generator + Humanizer Agent (New PDF Spec) ↓
          </a>
        </div>
      </div>

      {/* 100% Untouched Original Page-by-Page PDF Humanizer */}
      <div id="top-pdf-humanizer">
        <PdfHumanizerWorkspace />
      </div>

      {/* Added Extra Modules from the Attached 11-Page PDF Report */}
      <DocumentAgentSuite />
    </div>
  );
}

