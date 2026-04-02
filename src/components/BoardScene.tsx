import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { compareCoords, getStack, listCoords } from '../game/board';
import { PieceModel3D } from './PieceModel3D';
import { type Coord, type GameMove, type GameState, type PieceKind, type Player } from '../game/types';

const CELL_SIZE = 1.08;
const BOARD_OFFSET = 4;
const PIECE_BASE_Y = 0.16;
const PIECE_STACK_STEP = 0.2;
const MOVE_ANIMATION_MS = 280;

interface BoardSceneProps {
  state: GameState;
  selectedSquare: Coord | null;
  highlightedMoves: GameMove[];
  onSquareClick: (coord: Coord) => void;
}

interface AnimatedPieceState {
  key: string;
  id: string;
  owner: Player;
  kind: PieceKind;
  from: [number, number, number];
  to: [number, number, number];
  startedAt: number;
  durationMs: number;
  lift: number;
}

interface AnimatedPieceProps {
  animation: AnimatedPieceState;
  progress: number;
}

function boardToWorld(coord: Coord): [number, number, number] {
  return [(coord.x - BOARD_OFFSET) * CELL_SIZE, 0, (coord.y - BOARD_OFFSET) * CELL_SIZE];
}

function pieceToWorld(coord: Coord, stackIndex: number): [number, number, number] {
  const [x, , z] = boardToWorld(coord);
  return [x, PIECE_BASE_Y + stackIndex * PIECE_STACK_STEP, z];
}

function markerPriority(type: GameMove['type']): number {
  if (type === 'betray') {
    return 5;
  }
  if (type === 'capture') {
    return 4;
  }
  if (type === 'stack') {
    return 3;
  }
  if (type === 'drop' || type === 'deploy') {
    return 2;
  }
  if (type === 'move') {
    return 1;
  }
  return 0;
}

function markerColor(type: GameMove['type']): string {
  if (type === 'betray') {
    return '#f28c52';
  }
  if (type === 'capture') {
    return '#f15f54';
  }
  if (type === 'stack') {
    return '#f2bc4d';
  }
  if (type === 'drop') {
    return '#65c7cf';
  }
  if (type === 'deploy') {
    return '#9dcf67';
  }
  return '#d7efe9';
}

function createPieceAnimation(previousState: GameState, state: GameState): AnimatedPieceState | null {
  const lastMove = state.history.at(-1)?.move;
  if (!lastMove || !('from' in lastMove)) {
    return null;
  }

  const previousSourceStack = getStack(previousState.board, lastMove.from);
  const sourceIndex = previousSourceStack.findIndex((piece) => piece.id === lastMove.pieceId);
  if (sourceIndex === -1) {
    return null;
  }

  const nextTargetStack = getStack(state.board, lastMove.to);
  const targetIndex = nextTargetStack.findIndex((piece) => piece.id === lastMove.pieceId);
  if (targetIndex === -1) {
    return null;
  }

  const nextPiece = nextTargetStack[targetIndex];
  const from = pieceToWorld(lastMove.from, sourceIndex);
  const to = pieceToWorld(lastMove.to, targetIndex);
  const planarDistance = Math.hypot(to[0] - from[0], to[2] - from[2]);

  if (planarDistance < 0.001) {
    return null;
  }

  return {
    key: `${state.updatedAt}:${lastMove.pieceId}`,
    id: lastMove.pieceId,
    owner: nextPiece.owner,
    kind: nextPiece.kind,
    from,
    to,
    startedAt: performance.now(),
    durationMs: MOVE_ANIMATION_MS,
    lift: Math.min(0.52, 0.16 + planarDistance * 0.14),
  };
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function AnimatedPiece({ animation, progress }: AnimatedPieceProps) {
  const eased = easeOutCubic(progress);
  const arc = Math.sin(Math.PI * progress) * animation.lift;
  const position: [number, number, number] = [
    THREE.MathUtils.lerp(animation.from[0], animation.to[0], eased),
    THREE.MathUtils.lerp(animation.from[1], animation.to[1], eased) + arc,
    THREE.MathUtils.lerp(animation.from[2], animation.to[2], eased),
  ];

  return (
    <group position={position}>
      <PieceModel3D owner={animation.owner} kind={animation.kind} />
    </group>
  );
}

export function BoardScene({
  state,
  selectedSquare,
  highlightedMoves,
  onSquareClick,
}: BoardSceneProps) {
  const previousStateRef = useRef<GameState | null>(null);
  const [animation, setAnimation] = useState<AnimatedPieceState | null>(null);
  const [animationNow, setAnimationNow] = useState(() => performance.now());

  useEffect(() => {
    const previousState = previousStateRef.current;
    if (!previousState || previousState.updatedAt === state.updatedAt) {
      previousStateRef.current = state;
      return;
    }

    const nextAnimation = createPieceAnimation(previousState, state);
    setAnimation(nextAnimation);
    previousStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!animation) {
      return;
    }

    let frameId = 0;

    const tick = () => {
      const now = performance.now();
      setAnimationNow(now);
      const rawProgress = (now - animation.startedAt) / animation.durationMs;
      const nextProgress = THREE.MathUtils.clamp(rawProgress, 0, 1);

      if (nextProgress >= 1) {
        setAnimation((current) => (current?.key === animation.key ? null : current));
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [animation]);

  const moveMarkers = useMemo(() => {
    const map = new Map<string, GameMove['type']>();

    for (const move of highlightedMoves) {
      if (move.type === 'resign' || move.type === 'ready') {
        continue;
      }
      const key = `${move.to.x},${move.to.y}`;
      const current = map.get(key);
      if (!current || markerPriority(move.type) > markerPriority(current)) {
        map.set(key, move.type);
      }
    }

    return map;
  }, [highlightedMoves]);

  const animationProgress = animation
    ? THREE.MathUtils.clamp((animationNow - animation.startedAt) / animation.durationMs, 0, 1)
    : 1;

  return (
    <div className="board-canvas">
      <Canvas
        camera={{ position: [0, 8.15, 6.55], fov: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <color attach="background" args={['#131610']} />
        <fog attach="fog" args={['#131610', 10, 21]} />
        <ambientLight intensity={1.2} />
        <directionalLight
          castShadow
          intensity={1.9}
          position={[8, 11, 5]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight intensity={0.7} position={[-6, 5, -4]} color="#b8f0d8" />
        <mesh position={[0, -0.45, 0]} receiveShadow>
          <boxGeometry args={[11.5, 0.65, 11.5]} />
          <meshStandardMaterial color="#43301f" roughness={0.88} />
        </mesh>

        {listCoords().map((coord) => {
          const [x, y, z] = boardToWorld(coord);
          const stack = getStack(state.board, coord);
          const top = stack.at(-1);
          const marker = moveMarkers.get(`${coord.x},${coord.y}`);
          const selected = selectedSquare ? compareCoords(coord, selectedSquare) : false;
          const squareColor = (coord.x + coord.y) % 2 === 0 ? '#a28253' : '#8e7046';

          return (
            <group key={`${coord.x}-${coord.y}`}>
              <mesh
                position={[x, y, z]}
                receiveShadow
                onClick={(event) => {
                  event.stopPropagation();
                  onSquareClick(coord);
                }}
              >
                <boxGeometry args={[0.98, 0.1, 0.98]} />
                <meshStandardMaterial color={squareColor} roughness={0.94} />
              </mesh>

              {selected ? (
                <mesh position={[x, 0.065, z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.22, 0.44, 32]} />
                  <meshBasicMaterial color="#fff2b2" transparent opacity={0.95} />
                </mesh>
              ) : null}

              {marker ? (
                <mesh position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.17, 24]} />
                  <meshBasicMaterial color={markerColor(marker)} transparent opacity={0.85} />
                </mesh>
              ) : null}

              {stack.map((piece, index) => {
                if (animation?.id === piece.id) {
                  return null;
                }

                const pieceY = PIECE_BASE_Y + index * PIECE_STACK_STEP;
                const buried = index !== stack.length - 1;
                return (
                  <group
                    key={piece.id}
                    position={[x, pieceY, z]}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSquareClick(coord);
                    }}
                  >
                    <PieceModel3D owner={piece.owner} kind={piece.kind} buried={buried} />
                  </group>
                );
              })}

              {top ? null : (
                <Text
                  position={[x, 0.07, z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.12}
                  color="#ead6ad"
                  anchorX="center"
                  anchorY="middle"
                >
                  {coord.x + 1}
                </Text>
              )}
            </group>
          );
        })}

        {animation ? (
          <AnimatedPiece key={animation.key} animation={animation} progress={animationProgress} />
        ) : null}

        {Array.from({ length: 9 }, (_, index) => {
          const label = String.fromCharCode(65 + index);
          const x = (index - BOARD_OFFSET) * CELL_SIZE;
          const z = (index - BOARD_OFFSET) * CELL_SIZE;
          return (
            <group key={`labels-${index}`}>
              <Text position={[x, 0.08, -5.65]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.18} color="#f5ebd0">
                {index + 1}
              </Text>
              <Text position={[-5.65, 0.08, z]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.18} color="#f5ebd0">
                {label}
              </Text>
            </group>
          );
        })}

        <OrbitControls
          enablePan={false}
          maxDistance={12.8}
          maxPolarAngle={1.14}
          minDistance={6.2}
          minPolarAngle={0.68}
          target={[0, 0.08, -0.36]}
        />
      </Canvas>
    </div>
  );
}
