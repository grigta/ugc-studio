import JobRunner from "@/components/JobRunner";
import { getTool } from "@/lib/tools";

export default function Page() {
  const tool = getTool("voice")!;
  return (
    <div>
      <h1 className="h1">{tool.label}</h1>
      <p className="sub">{tool.description}</p>
      <JobRunner tool={tool} />
    </div>
  );
}
