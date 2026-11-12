'use strict';

function estimateSongMood(buffer) {
  if (buffer.duration < 2) return { unavailable: '2초 이상인 음악 파일을 골라 주세요.' };

  const channels = Array.from({ length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel));
  const frameSize = Math.round(buffer.sampleRate * 0.02);
  const frameDuration = frameSize / buffer.sampleRate;
  const levels = [];

  for (let start = 0; start + frameSize <= buffer.length; start += frameSize) {
    let power = 0;
    for (const samples of channels) {
      for (let sample = start; sample < start + frameSize; sample++) {
        power += samples[sample] ** 2;
      }
    }
    const meanPower = power / (frameSize * channels.length);
    levels.push(10 * Math.log10(Math.max(meanPower, 1e-12)));
  }

  // Normalize against a typical loud frame so a single peak or the file gain
  // does not set the scale for the rest of the song.
  const audibleLevels = levels.filter(level => level > -65).sort((a, b) => a - b);
  if (audibleLevels.length * frameDuration < 0.4) {
    return { unavailable: '분위기를 추정할 만큼 소리가 충분하지 않아요.' };
  }
  const reference = audibleLevels[Math.floor(audibleLevels.length * 0.95)];
  const activeFloor = Math.max(-65, reference - 26);
  const first = levels.findIndex(level => level >= activeFloor);
  const last = levels.findLastIndex(level => level >= activeFloor);
  const duration = (last - first + 1) * frameDuration;
  if (duration < 2) return { unavailable: '소리가 있는 구간이 너무 짧아요.' };

  let accents = 0;
  let totalRise = 0;
  const cooldown = Math.ceil(0.12 / frameDuration);
  for (let i = first + 2; i <= last; i++) {
    const rise = levels[i] - Math.max(levels[i - 2], activeFloor);
    if (levels[i] >= activeFloor && rise >= 4) {
      accents++;
      totalRise += rise;
      i += cooldown - 1;
    }
  }

  const accentsPerSecond = accents / duration;
  const averageRise = accents ? totalRise / accents : 0;
  const density = Math.min(1, accentsPerSecond / 3.5);
  const punch = Math.min(1, averageRise / 12) * Math.min(1, accentsPerSecond / 2);
  const activity = 0.75 * density + 0.25 * punch;
  const mood = activity < 0.34 ? '차분함' : activity < 0.68 ? '경쾌함' : '활기참';
  return { mood, accentsPerSecond, averageRise };
}
