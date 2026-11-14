# رنّة ZAPP الأصلية: أربع نغمات صاعدة بصوت يشبه الماريمبا + لمعة جرس خفيفة
import numpy as np, wave
SR=44100
def tone(f, dur, amp=1.0):
    t=np.arange(int(SR*dur))/SR
    # ماريمبا: أساسي + توافقيات خافتة بتتلاشى بسرعة
    env=np.exp(-t*7.0)
    att=np.minimum(1,t/0.004)
    s=(np.sin(2*np.pi*f*t)+0.35*np.sin(2*np.pi*f*4*t)*np.exp(-t*25)+0.18*np.sin(2*np.pi*f*2*t)*np.exp(-t*12))
    return amp*s*env*att
def bell(f,dur,amp=0.25):
    t=np.arange(int(SR*dur))/SR
    return amp*np.sin(2*np.pi*f*t)*np.exp(-t*3.2)*np.minimum(1,t/0.01)*(1+0.3*np.sin(2*np.pi*5*t))
L=2.6
out=np.zeros(int(SR*L))
def put(x,at):
    i=int(SR*at); out[i:i+len(x)]+=x[:len(out)-i]
notes=[(587.33,0.00),(739.99,0.16),(880.00,0.32),(1174.66,0.48)]  # ري، فا#، لا، ري
for f,at in notes: put(tone(f,0.9),at)
put(bell(1760,1.4),0.48)
# تكرار مختصر للنغمتين الأخيرتين (خاتمة)
put(tone(880,0.7,0.7),0.95); put(tone(1174.66,1.0,0.8),1.11)
out/=np.max(np.abs(out)); out*=0.85
# تلاشي ناعم بالآخر حتى ما يطقطق التكرار
fade=int(SR*0.05); out[-fade:]*=np.linspace(1,0,fade)
pcm=(out*32767).astype(np.int16)
with wave.open('zapp-ring.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(out)/SR)
