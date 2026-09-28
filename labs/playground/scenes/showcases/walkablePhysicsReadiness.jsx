import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

const WalkablePhysicsReadinessContext = createContext(null);

export function WalkablePhysicsReadinessProvider({ children, onPendingChange }) {
  const pendingRef = useRef(new Set());
  const publish = useCallback(() => {
    onPendingChange?.(pendingRef.current.size);
  }, [onPendingChange]);
  const value = useMemo(() => ({
    begin(token) {
      pendingRef.current.add(token);
      publish();
    },
    complete(token) {
      if (!pendingRef.current.delete(token)) return;
      publish();
    },
  }), [publish]);

  return (
    <WalkablePhysicsReadinessContext.Provider value={value}>
      {children}
    </WalkablePhysicsReadinessContext.Provider>
  );
}

/**
 * Register an async collider producer with the nearest shared walkable host.
 * The host pauses stepping before the first animation frame and resumes only
 * after every registered producer has committed its collider or failed.
 */
export function useWalkablePhysicsReadiness(active = true, identity = 'asset') {
  const gate = useContext(WalkablePhysicsReadinessContext);
  const token = useMemo(() => Symbol(`walkable-physics:${identity}`), [identity]);
  const completedRef = useRef(false);

  useLayoutEffect(() => {
    completedRef.current = false;
    if (!active || !gate) return undefined;
    gate.begin(token);
    return () => gate.complete(token);
  }, [active, gate, token]);

  return useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    gate?.complete(token);
  }, [gate, token]);
}
