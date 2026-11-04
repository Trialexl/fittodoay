'use client';

export function ProgramNavigator({
  folders,
  selectedId,
  onSelect,
  onCreate,
}: {
  folders: { id: number; name: string; is_active: boolean }[];
  selectedId?: number;
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="program-library" aria-label="Мои программы">
      <div className="program-library-heading">
        <span>Мои программы</span>
        <span>{folders.length}</span>
      </div>
      <nav className="program-library-list" aria-label="Выбор программы">
        {folders.map((folder) => (
          <button
            type="button"
            key={folder.id}
            aria-current={selectedId === folder.id ? 'true' : undefined}
            onClick={() => onSelect(folder.id)}
          >
            <span className="program-library-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 7a3 3 0 0 1 3-3h4l2 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z" />
              </svg>
            </span>
            <span className="program-library-name">
                <strong title={folder.name}>{folder.name}</strong>
              <small>
                <i data-active={folder.is_active} />
                {folder.is_active ? 'Активна' : 'Отключена'}
              </small>
            </span>
            <span aria-hidden="true" className="program-library-arrow">
              ↗
            </span>
          </button>
        ))}
      </nav>
      <button type="button" className="program-library-create" onClick={onCreate}>
        <span aria-hidden="true">+</span> Новая программа
      </button>
    </aside>
  );
}
