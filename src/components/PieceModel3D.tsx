import { Text } from '@react-three/drei';
import { getPieceDefinition } from '../game/pieces';
import { type PieceKind, type Player } from '../game/types';

interface PieceModel3DProps {
  owner: Player;
  kind: PieceKind;
  buried?: boolean;
  tone?: 'default' | 'dark';
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  fontSize?: number;
  frontWidth?: number;
  frontHeight?: number;
  frontDepth?: number;
}

function ownerColor(owner: Player, buried: boolean, tone: 'default' | 'dark'): string {
  if (tone === 'dark') {
    return buried ? '#14171a' : '#24292f';
  }

  if (owner === 'south') {
    return buried ? '#7f4a2e' : '#cb7e42';
  }

  return buried ? '#24313a' : '#405d6d';
}

function faceColor(owner: Player, tone: 'default' | 'dark'): string {
  if (tone === 'dark') {
    return '#f2ead4';
  }

  return owner === 'south' ? '#f5d292' : '#d8e8ef';
}

function labelColor(owner: Player, tone: 'default' | 'dark'): string {
  if (tone === 'dark') {
    return '#f4f1e8';
  }

  return owner === 'south' ? '#2a170f' : '#f0f4f6';
}

function pieceFrontOffset(owner: Player, radiusBottom: number): number {
  return owner === 'south' ? -radiusBottom * 0.44 : radiusBottom * 0.44;
}

function textRotation(owner: Player): [number, number, number] {
  return [-Math.PI / 2, 0, owner === 'south' ? 0 : Math.PI];
}

export function PieceModel3D({
  owner,
  kind,
  buried = false,
  tone = 'default',
  radiusTop = 0.34,
  radiusBottom = 0.4,
  height = 0.16,
  fontSize = 0.18,
  frontWidth = 0.18,
  frontHeight = 0.03,
  frontDepth = 0.08,
}: PieceModel3DProps) {
  const piece = getPieceDefinition(kind);
  const topY = height / 2 + 0.015;

  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[radiusTop, radiusBottom, height, 6]} />
        <meshStandardMaterial
          color={ownerColor(owner, buried, tone)}
          metalness={0.08}
          roughness={0.62}
        />
      </mesh>
      {!buried ? (
        <>
          <mesh position={[0, topY, pieceFrontOffset(owner, radiusBottom)]}>
            <boxGeometry args={[frontWidth, frontHeight, frontDepth]} />
            <meshStandardMaterial color={faceColor(owner, tone)} roughness={0.45} />
          </mesh>
          <Text
            position={[0, topY, 0]}
            rotation={textRotation(owner)}
            fontSize={fontSize}
            color={labelColor(owner, tone)}
            anchorX="center"
            anchorY="middle"
          >
            {piece.shortLabel}
          </Text>
        </>
      ) : null}
    </group>
  );
}
