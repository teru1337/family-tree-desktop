function horizontalEndpoints(first, second) {
  const start = first.left <= second.left ? first : second;
  const end = first.left <= second.left ? second : first;
  return {
    startX: start.left + start.width,
    startY: start.top + start.height / 2,
    endX: end.left,
    endY: end.top + end.height / 2,
  };
}

export function verticalConnection(from, to, minimumGap = 24) {
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height;
  const endX = to.left + to.width / 2;
  const endY = to.top;
  const middleY = startY + Math.max(minimumGap, (endY - startY) / 2);
  return { startX, startY, endX, endY, middleY, path: `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}` };
}

export function horizontalConnection(first, second, minimumGap = 18) {
  const { startX, startY, endX, endY } = horizontalEndpoints(first, second);
  const middleX = startX + Math.max(minimumGap, (endX - startX) / 2);
  return { startX, startY, endX, endY, middleX, path: `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}` };
}
