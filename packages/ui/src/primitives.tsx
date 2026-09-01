import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const extra =
    variant === "secondary" ? " mf-btn-secondary" : variant === "ghost" ? " mf-btn-ghost" : "";
  return <button className={`mf-btn${extra} ${className}`.trim()} type="button" {...props} />;
}

export function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="mf-icon-btn" type="button" {...props} />;
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="mf-card">{children}</section>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="mf-input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="mf-textarea" {...props} />;
}

export function Spinner() {
  return <div className="mf-spinner" aria-label="Loading" />;
}

export function UsageBadge({
  remaining,
  limit,
  noun,
}: {
  remaining: number;
  limit: number | null;
  noun?: string;
}) {
  if (limit === null) {
    return <span className="mf-badge">Unlimited</span>;
  }
  const left = Number.isFinite(remaining) ? remaining : limit;
  return (
    <span className="mf-badge">
      {left} of {limit}
      {noun ? ` ${noun}` : ""} left
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mf-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mf-center">
      <strong>{title}</strong>
      <p style={{ color: "var(--mf-muted)", margin: 0 }}>{body}</p>
    </div>
  );
}

export function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mf-center">
      <strong style={{ color: "var(--mf-danger)" }}>{title}</strong>
      <p style={{ color: "var(--mf-muted)", margin: 0 }}>{body}</p>
    </div>
  );
}
