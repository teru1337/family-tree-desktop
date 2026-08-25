export function cardBounds(position) {
  const left = Number(position?.left) || 0;
  const top = Number(position?.top) || 0;
  const width = Math.max(0, Number(position?.width) || 0);
  const height = Math.max(0, Number(position?.height) || 0);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

export function cardAnchor(position, side) {
  const bounds = cardBounds(position);
  if (side === "top") return { x: bounds.centerX, y: bounds.top };
  if (side === "bottom") return { x: bounds.centerX, y: bounds.bottom };
  if (side === "left") return { x: bounds.left, y: bounds.centerY };
  if (side === "right") return { x: bounds.right, y: bounds.centerY };
  throw new Error(`Неизвестная сторона карточки: ${side}`);
}

export function verticalConnection(from, to, minimumGap = 24) {
  const fromBounds = cardBounds(from);
  const toBounds = cardBounds(to);
  const downward = toBounds.centerY >= fromBounds.centerY;
  const start = cardAnchor(from, downward ? "bottom" : "top");
  const end = cardAnchor(to, downward ? "top" : "bottom");
  const distance = Math.abs(end.y - start.y);
  const middleY = start.y + (downward ? 1 : -1) * Math.max(minimumGap, distance / 2);
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  return { startX, startY, endX, endY, middleY, path: `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}` };
}

export function horizontalConnection(first, second, minimumGap = 18) {
  const firstBounds = cardBounds(first);
  const secondBounds = cardBounds(second);
  const leftToRight = secondBounds.centerX >= firstBounds.centerX;
  const start = cardAnchor(leftToRight ? first : second, "right");
  const end = cardAnchor(leftToRight ? second : first, "left");
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  const middleX = startX + (leftToRight ? 1 : -1) * Math.max(minimumGap, Math.abs(endX - startX) / 2);
  return { startX, startY, endX, endY, middleX, path: `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}` };
}
