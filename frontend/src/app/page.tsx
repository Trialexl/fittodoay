export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1>fitTODOey</h1>
      <p>
        Персональные тренировки в формате чеклистов. Backend — Django, Frontend —
        Next.js.
      </p>
    </main>
  );
}
