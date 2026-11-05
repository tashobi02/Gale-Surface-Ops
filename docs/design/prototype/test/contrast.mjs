const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
export const cr=(a,b)=>{const x=lum(a),y=lum(b);const [hi,lo]=x>y?[x,y]:[y,x];return (hi+.05)/(lo+.05)};
if(process.argv[1].endsWith('contrast.mjs')){
const T=[
['BRIEF','ink/paper','#1A1A1A','#F7F5F0',15.97],['BRIEF','ink/concrete','#1A1A1A','#E8E6E1',13.95],['BRIEF','ink/steel','#1A1A1A','#CFCFCF',11.17],
['BRIEF','ink-2/paper','#5A5A5A','#F7F5F0',6.33],['BRIEF','paper/charcoal','#F7F5F0','#282828',13.53],['BRIEF','charcoal-text-2/charcoal','#A3A3A3','#282828',5.84],
['BRIEF','ink/signal','#1A1A1A','#E7553D',4.78],['BRIEF','white/signal','#FFFFFF','#E7553D',3.64],['BRIEF','signal-ink/paper','#C2401F','#F7F5F0',4.76],['BRIEF','signal/charcoal','#E7553D','#282828',4.05],
['OPS','hairline/panel','#2A313A','#14181D',1.36],['OPS','edge/panel','#5C6670','#14181D',3.05],['OPS','text-1/panel','#ECEFF2','#14181D',15.44],['OPS','text-2/panel','#A9B3BE','#14181D',8.38],
['OPS','text-3/panel','#8592A0','#14181D',5.62],['OPS','text-3/raised','#8592A0','#1C2128',5.10],['OPS','route/panel','#4CC9F0','#14181D',9.27],
['OPS','nominal/panel','#3DDC84','#14181D',9.99],['OPS','caution/panel','#FFB020','#14181D',9.75],['OPS','warning/panel','#FF4D4D','#14181D',5.45],['OPS','warning/raised','#FF4D4D','#1C2128',4.95],
['OPS','advisory/panel','#4CC9F0','#14181D',9.27],['OPS','unknown/panel','#B8A9FF','#14181D',8.62],['OPS','white/warning-fill','#FFFFFF','#B3261E',6.54],['OPS','black/caution-fill','#000000','#FFB020',11.48],
['HUD','hud-text/black','#FFFFFF','#000000',21],['HUD','hud-text-2/black','#A9B3BE','#000000',9.88],['HUD','hud-nominal/black','#3DDC84','#000000',11.77],['HUD','hud-caution/black','#FFB020','#000000',11.48],['HUD','hud-warning/black','#FF6B6B','#000000',7.57],['HUD','hud-advisory/black','#4CC9F0','#000000',10.92],
['PRINT','text/white','#111827','#FFFFFF',17.7],['PRINT','caution/white','#9A5B00','#FFFFFF',5.43],['PRINT','warning/white','#B42318','#FFFFFF',6.57],['PRINT','nominal/white','#0E7A4F','#FFFFFF',5.36]];
for(const [m,n,a,b,s] of T){const r=cr(a,b);console.log(m.padEnd(6),n.padEnd(28),r.toFixed(2).padStart(6),'spec',String(s).padStart(5),Math.abs(r-s)>0.03?'  <-- DIFF '+(r-s).toFixed(2):'')}
}
