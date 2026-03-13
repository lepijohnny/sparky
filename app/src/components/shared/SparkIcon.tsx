import styles from "./SparkIcon.module.css";

/**
 * Static spark icon matching the app's spark animation motif.
 * Six dots arranged in a radial burst pattern.
 */
export function SparkIcon({ size = 16 }: { size?: number }) {
  return (
    <div className={styles.icon} style={{ width: size, height: size }}>
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
      <div className={styles.spark} />
    </div>
  );
}
