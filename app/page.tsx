import PdfHumanizerWorkspace from '@/components/PdfHumanizerWorkspace';
import DocumentAgentSuite from '@/components/DocumentAgentSuite';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <PdfHumanizerWorkspace />
      <DocumentAgentSuite />
    </div>
  );
}
