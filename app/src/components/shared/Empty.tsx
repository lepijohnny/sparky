export default function Empty({ message }: { message: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{message}</span>
    </div>
  );
}
