import { Canvas } from '@react-three/fiber';
import { StrictMode, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createStyleTargetLabel, labelStyleTarget } from '@call-me-sensei/toonlab/styles';
import { ToonLabScene } from '@call-me-sensei/toonlab/react';

function Rock() {
  const ref = useRef();
  useLayoutEffect(() => {
    labelStyleTarget(ref.current, createStyleTargetLabel('natural.rock', { targetId: 'example-rock' }));
  }, []);
  return <mesh ref={ref}><boxGeometry args={[2, 1.4, 1.6]} /><meshStandardMaterial color="#888888" /></mesh>;
}

function Scene() {
  return <><Rock /><ToonLabScene bundle="call-me-sensei" quality="balanced" /></>;
}

createRoot(document.querySelector('#root')).render(
  <StrictMode><Canvas camera={{ position: [4, 3, 6] }}><Scene /></Canvas></StrictMode>,
);
