/** Small round status pill. Tone is derived automatically from the text. */
export default function Badge({ children, tone }) {
  let resolvedTone = tone;
  if (!resolvedTone && typeof children === 'string') {
    const text = children.toLowerCase();
    if (text.includes('alloc') || text === 'delivered' || text === 'approved' || text === 'send') {
      resolvedTone = 'green';
    } else if (text.includes('pending')) {
      resolvedTone = 'amber';
    } else if (text.includes('unalloc') || text === 'failed' || text === 'critical') {
      resolvedTone = 'red';
    } else if (text.includes('cancel')) {
      resolvedTone = 'grey';
    } else {
      resolvedTone = 'navy';
    }
  }
  return <span className={`badge badge-${resolvedTone || 'navy'}`}>{children}</span>;
}