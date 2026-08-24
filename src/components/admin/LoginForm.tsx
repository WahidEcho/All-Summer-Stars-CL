'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase/client';
import { AdminButton } from '@/components/admin/Button';
import { Callout } from '@/components/admin/Callout';
import { Field, TextInput } from '@/components/admin/Controls';

export interface LoginFormProps {
  /** Where the operator was headed before the gate stopped them. */
  next: string;
}

/**
 * Email and password against Supabase Auth.
 *
 * `router.refresh()` after a successful sign-in is not optional: the session
 * cookie has only just been written, and every admin page is a server
 * component that must be re-rendered with it before the console is usable.
 */
export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter both an email address and a password.');
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'That email and password do not match a staff account.'
            : signInError.message,
        );
        return;
      }

      const target = next.startsWith('/admin') ? next : '/admin';
      router.replace(target);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reach the authentication service.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Email" htmlFor={emailId}>
        <TextInput
          id={emailId}
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </Field>

      <Field label="Password" htmlFor={passwordId}>
        <TextInput
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <AdminButton type="submit" variant="primary" size="lg" fullWidth busy={busy}>
        Sign in
      </AdminButton>
    </form>
  );
}

export default LoginForm;
