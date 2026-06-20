import LibraryView from "@/components/LibraryView";

export default function Page() {
  return (
    <div>
      <h1 className="h1">Библиотека</h1>
      <p className="sub">Сохранённые персонажи, товар-кадры и голоса. Доступны для выбора в авто-пайплайне.</p>
      <LibraryView />
    </div>
  );
}
