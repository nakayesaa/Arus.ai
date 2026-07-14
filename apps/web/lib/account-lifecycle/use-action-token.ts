'use client';

import { useEffect, useRef, useState } from 'react';

interface ActionTokenState {
  token: string;
  ready: boolean;
}

export function useActionToken(initialToken = ''): ActionTokenState {
  const extracted = useRef(false);
  const [state, setState] = useState<ActionTokenState>({
    token: initialToken,
    ready: false,
  });

  useEffect(() => {
    if (extracted.current) {
      return;
    }
    extracted.current = true;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token') ?? initialToken;

    if (token) {
      // Remove the credential immediately after extraction so later
      // navigation, screenshots, and copied URLs cannot retain it. URL
      // fragments never reach the web server.
      window.history.replaceState({}, '', window.location.pathname);
    }

    setState({ token, ready: true });
  }, [initialToken]);

  return state;
}
