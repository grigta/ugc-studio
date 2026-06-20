import AutoPipeline from "@/components/AutoPipeline";

export default function Page() {
  return (
    <div>
      <h1 className="h1">Авто-пайплайн</h1>
      <p className="sub">Идея → сценарий → персонаж → товар → видео → голос → сборка, одной кнопкой.</p>
      <AutoPipeline />
    </div>
  );
}
