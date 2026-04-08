import styles from "./EmptySection.module.css";

export default function EmptySection({ message }: { message: string }) {
  return (
    <div className={styles.container}>
      <span className={styles.text}>{message}</span>
    </div>
  );
}
