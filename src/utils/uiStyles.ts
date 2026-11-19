export const TACTILE_3D_ACTIVE = 'btn-glossy-3d-active font-medium';

export const TACTILE_3D_INACTIVE = 'btn-glossy-3d-inactive font-medium';

export function tactile3dClass(active: boolean): string {
  return active ? TACTILE_3D_ACTIVE : TACTILE_3D_INACTIVE;
}
