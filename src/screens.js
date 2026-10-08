// screens.js — title, garage (car + stage select) and results, in the
// original's UI language: checkerboard header/footer strips, cyan page arrows,
// chunky bitmap-style type with a hard black drop shadow, selected row in yellow.
import { CARS } from './cars.js';
import { STAGES } from './stage.js';
import { formatTime } from './hud.js';

export const STAGE_LIST = Object.keys(STAGES);

export const WEATHER_LIST = ['sunny', 'rainy', 'night', 'noon'];
export const WEATHER_LABELS = {
  sunny: 'SUNNY',
  rainy: 'RAINY',
  night: 'NIGHT',
  noon: 'NOON'
};

export class Screens {
  constructor() {
    this.title = document.getElementById('screen-title');
    this.garage = document.getElementById('screen-garage');
    this.results = document.getElementById('screen-results');

    this.garageName = document.getElementById('garage-name');
    this.garageClass = document.getElementById('garage-class');
    this.garageStage = document.getElementById('garage-stage');
    this.garageWeather = document.getElementById('garage-weather');
    this.garageBars = {
      speed: document.getElementById('bar-speed'),
      acc: document.getElementById('bar-acc'),
      grip: document.getElementById('bar-grip')
    };

    this.resultTime = document.getElementById('result-time');
    this.resultPenalty = document.getElementById('result-penalty');
    this.resultMedal = document.getElementById('result-medal');
    this.resultNote = document.getElementById('result-note');
    this.resultBest = document.getElementById('result-best');

    // Title mode menu: first two rows selectable, the third (Bluetooth) muted.
    this.modeItems = Array.from(document.querySelectorAll('#screen-title .menu li'));
    this.modeIndex = 0;

    this.carIndex = 0;
    this.stageIndex = 0;
    this.weatherIndex = 0;
    this._renderTitle();
  }

  _renderTitle() {
    this.modeItems.forEach((li, i) => {
      li.classList.toggle('selected', i === this.modeIndex);
    });
  }

  /** Cycle CHAMPIONSHIP / TIME TRIAL. Returns true if the selection changed. */
  cycleMode(delta) {
    const before = this.modeIndex;
    this.modeIndex = Math.max(0, Math.min(1, this.modeIndex + delta));
    this._renderTitle();
    return before !== this.modeIndex;
  }

  get selectedMode() {
    return this.modeIndex === 0 ? 'champ' : 'trial';
  }

  show(which) {
    this.title.classList.toggle('hidden', which !== 'title');
    this.garage.classList.toggle('hidden', which !== 'garage');
    this.results.classList.toggle('hidden', which !== 'results');
  }

  hideAll() {
    this.show(null);
  }

  // ------------------------------------------------------------- garage ---
  openGarage() {
    this.carIndex = Math.max(0, Math.min(CARS.length - 1, this.carIndex));
    this.stageIndex = Math.max(0, Math.min(STAGE_LIST.length - 1, this.stageIndex));
    this._renderGarage();
    this.show('garage');
  }

  _renderGarage() {
    const car = CARS[this.carIndex];
    this.garageName.textContent = car.name;
    this.garageClass.textContent = car.class;
    const stage = STAGES[STAGE_LIST[this.stageIndex]];
    this.garageStage.textContent = 'STAGE ' + (this.stageIndex + 1) + '  ' + stage.name;
    const weather = WEATHER_LIST[this.weatherIndex];
    this.garageWeather.textContent = 'WEATHER  ' + WEATHER_LABELS[weather];
    for (const key of ['speed', 'acc', 'grip']) {
      this.garageBars[key].style.width = Math.round(car.stats[key] * 100) + '%';
    }
  }

  /** Advance the car carousel. Returns true if the selection changed. */
  cycleCar(delta) {
    const before = this.carIndex;
    this.carIndex = (this.carIndex + delta + CARS.length) % CARS.length;
    this._renderGarage();
    return before !== this.carIndex;
  }

  /** Advance the stage carousel. Returns true if the selection changed. */
  cycleStage(delta) {
    const before = this.stageIndex;
    this.stageIndex = (this.stageIndex + delta + STAGE_LIST.length) % STAGE_LIST.length;
    this._renderGarage();
    return before !== this.stageIndex;
  }

  get selectedCar() {
    return CARS[this.carIndex];
  }

  get selectedStageId() {
    return STAGE_LIST[this.stageIndex];
  }

  /** Advance the weather carousel. Returns true if the selection changed. */
  cycleWeather(delta) {
    const before = this.weatherIndex;
    this.weatherIndex = (this.weatherIndex + delta + WEATHER_LIST.length) % WEATHER_LIST.length;
    this._renderGarage();
    return before !== this.weatherIndex;
  }

  get selectedWeather() {
    return WEATHER_LIST[this.weatherIndex];
  }

  /** Push the current car spec to the live 3D preview car. */
  applyPreview(previewCar) {
    previewCar.applySpec(CARS[this.carIndex]);
  }

  // ------------------------------------------------------------ results ---
  showResults(raw, penalty, target, opts) {
    const o = opts || {};
    const total = raw + penalty;
    this.resultTime.textContent = formatTime(raw);
    this.resultPenalty.textContent = penalty > 0.05
      ? 'PENALTY +' + formatTime(penalty)
      : 'PENALTY NONE';
    this.resultPenalty.className = penalty > 0.05 ? 'penalty-bad' : 'penalty-ok';
    this.resultBest.textContent = o.best || '';

    // Bronze / silver / gold, as in the original's per-stage medals.
    let medal = 'NO MEDAL';
    if (total <= target.gold) medal = 'GOLD MEDAL';
    else if (total <= target.silver) medal = 'SILVER MEDAL';
    else if (total <= target.bronze) medal = 'BRONZE MEDAL';
    this.resultMedal.textContent = medal;
    this.resultMedal.className = 'medal medal-' + medal.split(' ')[0].toLowerCase();

    this.resultNote.textContent = o.note || (total <= target.gold
      ? 'STAGE CLEARED'
      : 'TARGET TIME ' + formatTime(target.bronze));
    this.show('results');
  }
}
