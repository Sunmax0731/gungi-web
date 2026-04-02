import { OrthographicCamera, View } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { type RefObject } from 'react';
import { PieceModel3D } from './PieceModel3D';
import { type PieceKind, type Player } from '../game/types';

export interface HandTrayItem {
  kind: PieceKind;
  count: number;
  selected: boolean;
  disabled: boolean;
}

interface HandTraySceneProps {
  owner: Player;
  items: HandTrayItem[];
  trackRefs: Map<PieceKind, RefObject<HTMLButtonElement | null>>;
}

interface HandPieceSceneProps {
  owner: Player;
  item: HandTrayItem;
}

function pedestalColor(owner: Player, selected: boolean, disabled: boolean): string {
  if (selected) {
    return '#65c7cf';
  }
  if (disabled) {
    return '#4a4036';
  }
  return owner === 'south' ? '#8a6c41' : '#31363b';
}

function accentColor(selected: boolean, disabled: boolean): string {
  if (selected) {
    return '#dff8fb';
  }
  if (disabled) {
    return '#5a534b';
  }
  return '#f5dfb0';
}

function HandPieceScene({ owner, item }: HandPieceSceneProps) {
  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[0, 4.9, 0.01]}
        rotation={[-Math.PI / 2, 0, 0]}
        zoom={56}
        near={0.1}
        far={20}
      />
      <ambientLight intensity={1.2} />
      <directionalLight intensity={1.1} position={[1.8, 5, 0.8]} />
      <pointLight intensity={0.18} position={[-1.1, 2.4, -0.9]} color="#b8f0d8" />
      <group position={[0, -0.03, 0]} scale={0.54}>
        <mesh position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.58, 32]} />
          <meshStandardMaterial
            color={pedestalColor(owner, item.selected, item.disabled)}
            metalness={0.08}
            roughness={0.78}
          />
        </mesh>
        <mesh position={[0, -0.155, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.54, 40]} />
          <meshBasicMaterial color={accentColor(item.selected, item.disabled)} transparent opacity={0.88} />
        </mesh>
        <group scale={item.disabled ? 0.94 : 1.02}>
          <PieceModel3D
            owner={owner}
            kind={item.kind}
            tone={owner === 'north' ? 'dark' : 'default'}
            radiusTop={0.31}
            radiusBottom={0.37}
            height={0.15}
            fontSize={0.17}
            frontWidth={0.15}
            frontHeight={0.028}
            frontDepth={0.08}
          />
        </group>
      </group>
    </>
  );
}

export function HandTrayScene({ owner, items, trackRefs }: HandTraySceneProps) {
  return (
    <div className="hand-tray-canvas" aria-hidden="true">
      <Canvas
        dpr={[1, 1.25]}
        frameloop="always"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        shadows={false}
      >
        {items.map((item, index) => (
          <View
            key={`${owner}-${item.kind}`}
            track={trackRefs.get(item.kind) as unknown as RefObject<HTMLElement>}
            index={index + 1}
          >
            <HandPieceScene owner={owner} item={item} />
          </View>
        ))}
      </Canvas>
    </div>
  );
}
