/* @flow */
import shallowEqual from '../util/shallowEqual';
import { isEqual, flatten, last } from 'lodash';
import { getHighestNote, getLowestNote, getMidiFromNote, midiDiff } from './midiNotes';

import type { ScoreBox, Tuning } from './stateTypes';

const calcXForNote = (measure: Object, noteIndex: number, indexOfRow: ?number): number => {
  let x = 0 + (noteIndex * 53 + 33);
  if(indexOfRow === 0) {
    x += 10;
  }
  if(measure.renderTimeSignature) {
    x += 30;
  }
  if(measure.notes.length === 0 && measure.indexOfRow !== 0) {
    x -= measure.renderTimeSignature ? 0 : 25;
  }
  return x;
};

const computeTrackLayout = (measures: Array<Object>): Array<Object> => {
  return measures.map((measure, measureIndex) => {
    let width = 59 * measure.notes.length;
    let renderBpm = false;
    if(measure.notes.length === 0) {
      width = 40;
    }
    if(measureIndex === 0) {
      width += 15;
      renderBpm = true;
    }

    let prevMeasure = measures[measureIndex - 1];
    if(prevMeasure && shallowEqual(prevMeasure.timeSignature, measure.timeSignature)) {
      if(prevMeasure.bpm !== measure.bpm) {
        renderBpm = true;
      }

      const newMeasure = {
        ...measure,
        width,
        renderTimeSignature: false,
        renderBpm
      };
      return isEqual(newMeasure, measure) ? measure : newMeasure;
    }
    width += 30;
    if(measure.notes.length === 0) {
      width += 20;
    }

    const newMeasure = {
      ...measure,
      width,
      renderTimeSignature: true,
      renderBpm
    };
    return isEqual(newMeasure, measure) ? measure : newMeasure;
  });
};

const trackWithRows = (measures: Array<Object>, scoreBox: ScoreBox): Array<Object> => {
  return measures.reduce((newMeasures, measure, measureIndex) => {
    if(measureIndex === 0) {
      const notes = measure.notes.map((note, noteIndex) => ({
        ...note,
        x: calcXForNote(measure, noteIndex, 0)
      }));

      const newMeasure = {
        ...measure,
        notes,
        rowIndex: measureIndex,
        indexOfRow: 0,
        xOfMeasure: 0
      };
      return [isEqual(newMeasure, measure) ? measure : newMeasure];
    }

    const currentRow = newMeasures[measureIndex - 1].rowIndex;
    const currentRowWidth = newMeasures.slice(0, measureIndex).reduce((accum, next) => {
      if(next.rowIndex === currentRow) {
        return accum + next.width;
      }
      return accum;
    }, 0);

    let newRowIndex = currentRow;
    let indexOfRow;
    if(currentRowWidth + measure.width >= scoreBox.width) {
      newRowIndex = currentRow + 1;
      indexOfRow = 0;
    }

    const notes = measure.notes.map((note, noteIndex) => ({
      ...note,
      x: calcXForNote(measure, noteIndex, indexOfRow)
    }));

    const newMeasure = {
      ...measure,
      notes,
      rowIndex: newRowIndex,
      indexOfRow,
      xOfMeasure: indexOfRow === 0 ? indexOfRow : currentRowWidth
    };
    return newMeasures.concat(isEqual(newMeasure, measure) ? measure : newMeasure);
  }, []);
};

const linearTrack = (track: Array<Object>): Array<Object> => {
  return track.map((measure, i) => {
    const indexOfRow = i === 0 ? 0 : undefined;
    const newMeasure = {
      ...measure,
      notes: measure.notes.map((note, noteIndex) => ({
        ...note,
        x: calcXForNote(measure, noteIndex, indexOfRow)
      })),
      rowIndex: 0,
      indexOfRow
    };
    return isEqual(newMeasure, measure) ? measure : newMeasure;
  });
};

const midiNotesForMeasure = (measure: Object, tuning: Tuning): Array<string> => {
  return flatten(measure.notes.map(note => {
    return note.fret.map((fret, i) => getMidiFromNote(fret, note.string[i], tuning));
  }));
};

const getYTop = (midi: string): number => {
  return midiDiff(midi, 'g4');
};

const getYBottom = (midi: string): number => {
  return midiDiff('f3', midi);
};

const getRowHeights = (measures: Array<Object>, tuning: Tuning): Array<Object> => {
  const rows = measures.reduce((rowGroups, measure) => {
    const midiNotes = midiNotesForMeasure(measure, tuning);
    const highest = getHighestNote(midiNotes);
    const lowest = getLowestNote(midiNotes);

    if(measure.indexOfRow === 0) { // new row
      return rowGroups.concat({ highest, lowest });
    } else {
      return rowGroups.slice(0, rowGroups.length - 1).concat({
        highest: getHighestNote([last(rowGroups).highest, highest]),
        lowest: getLowestNote([last(rowGroups).lowest, lowest])
      });
    }
  }, []);

  const rowsWithY = rows.map(row => {
    const yTop = getYTop(row.highest) * 6.5; // 6.5 is about half of the distance between bars on the staff
    const yBottom = getYBottom(row.lowest) * 6.5;
    return {
      yTop: yTop > 0 ? yTop : 0,
      yBottom: yBottom > 0 ? yBottom : 0
     };
  });

  return measures.map(measure => {
    return {
      ...measure,
      yTop: rowsWithY[measure.rowIndex].yTop,
      yBottom: rowsWithY[measure.rowIndex].yBottom
    };
  });
};

export const prepareRowLayout = (
  measures: Array<Object>, layout: string, scoreBox: ScoreBox, tuning: Tuning
): Array<Object> => {
  const newMeasures = layout === 'page' ?
    trackWithRows(computeTrackLayout(measures), scoreBox) :
    linearTrack(computeTrackLayout(measures));

  return getRowHeights(newMeasures, tuning);
};