import React, { Component } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import { connect } from 'react-redux';

import { makeMapStateToProps } from '../util/selectors';
import { makeScoreSelector } from '../util/layoutSelectors';
import { setSelectRange } from '../actions/cursor';

import Measure from './measure/Measure';
import SelectBox from './SelectBox';

const SVG_LEFT = 265;
const SVG_TOP = 5;
const SELECT_ERROR = 6; // Give some room for user error when selecting a range of notes

const style = {
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'flex',
  flexWrap: 'wrap',
  flex: 1
};

class Score extends Component {
  constructor(props) {
    super(props);

    this.getNoteRangeForMeasure = this.getNoteRangeForMeasure.bind(this);
    this.getSelectedRangeForSingleRow = this.getSelectedRangeForSingleRow.bind(this);
    this.getSelectedRange = this.getSelectedRange.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);

    this.state = {
      dragStart: undefined,
      dragEnd: undefined
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  getNoteRangeForMeasure(measure, xStart, xEnd) {
    const notes = measure.notes.map((note, i) => {
      const noteX = note.x + measure.xOfMeasure;
      return noteX + SELECT_ERROR > xStart && noteX + SELECT_ERROR < xEnd ? i : null;
    });
    const filteredNotes = notes.filter(note => note !== null);
    return filteredNotes.length === notes.length ? 'all' : filteredNotes;
  }

  getSelectedRangeForSingleRow(measure, xStart, xEnd) {
    if(xStart > measure.xOfMeasure && xEnd < measure.xOfMeasure + measure.width) {
      return this.getNoteRangeForMeasure(measure, xStart, xEnd);
    } else if((xStart < measure.xOfMeasure && xEnd > measure.xOfMeasure) ||
       (xStart > measure.xOfMeasure && xStart < measure.xOfMeasure + measure.width)) {

      if(measure.xOfMeasure < xStart) {
        return this.getNoteRangeForMeasure(measure, xStart, measure.xOfMeasure + measure.width);
      } else if(xEnd < measure.xOfMeasure + measure.width) {
        return this.getNoteRangeForMeasure(measure, measure.xOfMeasure, xEnd);
      } else {
        return 'all';
      }
    } else {
      return undefined;
    }
  }

  getSelectedRange(measure, xStart, xEnd, selectedRows) {
    if(!selectedRows) {
      return undefined;
    }
    const selectedRowIndex = selectedRows.indexOf(measure.rowIndex);
    if(selectedRowIndex === -1) {
      return undefined;
    }

    if(selectedRows.length === 1) {
      return this.getSelectedRangeForSingleRow(measure, xStart, xEnd);
    } else if(selectedRowIndex === 0) {
      if(measure.xOfMeasure + measure.width > xStart) {
        if(measure.xOfMeasure < xStart) { // starting measure, need note index
          return this.getNoteRangeForMeasure(measure, xStart, measure.xOfMeasure + measure.width);
        } else {
          return 'all';
        }
      }
    } else if(selectedRowIndex === selectedRows.length - 1) {
      if(xEnd > measure.xOfMeasure) {
        if(xEnd < measure.xOfMeasure + measure.width) { // last measure
          return this.getNoteRangeForMeasure(measure, measure.xOfMeasure, xEnd);
        } else {
          return 'all';
        }
      }
    } else {
      return 'all';
    }
  }

  rowFromY(dragY, measures, tuning) {
    const rowHeights = measures.reduce((accum, measure) => {
      if(!accum[measure.rowIndex]) {
        return accum.concat(
          (accum.length > 0 ? accum[accum.length - 1] : 0) +
          measure.yTop + measure.yBottom + 70 + tuning.length * 20
        );
      }
      return accum;
    }, []);

    return rowHeights ?
      rowHeights.reduce((accum, row, i) => accum === -1 && dragY < row ? i : accum, -1):
      0;
  }

  onMouseDown(e) {
    e.preventDefault();

    const dragX = e.pageX - SVG_LEFT;
    const dragY = e.pageY - SVG_TOP;

    this.setState({
      dragStart: { dragX, dragY },
      dragX,
      dragY,
      selectedRanges: undefined
    });
  }

  onMouseUp() {
    const { dragX, dragY, dragHeight, dragWidth } = this.state;

    let selectedRows;
    if(dragWidth > 5 && dragHeight > 5) {
      const startRow = this.rowFromY(dragY, this.props.measures, this.props.tuning);
      const endRow = this.rowFromY(dragY + dragHeight, this.props.measures, this.props.tuning);
      selectedRows = Array.from({ length: endRow - startRow + 1 }, (_, k) => k + startRow);
    }

    const selectRange = this.props.measures.reduce((accum, measure, i) => {
      const measureRange = this.getSelectedRange(measure, dragX, dragX + dragWidth, selectedRows);
      if(Array.isArray(measureRange)) {
        if(measureRange.length === 0) {
          return accum;
        }
      }

      const obj = {};
      obj[i] = measureRange;
      return measureRange ? Object.assign({}, accum, obj) : accum;
    }, {});

    if(Object.keys(selectRange).length > 0) {
      this.props.setSelectRange(selectRange);
    } else {
      this.props.setSelectRange(undefined);
    }

    this.setState({
      dragStart: undefined,
      dragX: undefined,
      dragY: undefined,
      dragWidth: undefined,
      dragHeight: undefined
    });
  }

  onMouseMove(e) {
    if(this.state.dragStart) {
      e.preventDefault();

      const x = e.pageX - SVG_LEFT;
      const y = e.pageY - SVG_TOP;

      this.setState({
        dragX: Math.min(this.state.dragStart.dragX, x),
        dragY: Math.min(this.state.dragStart.dragY, y),
        dragWidth: Math.abs(this.state.dragStart.dragX - x),
        dragHeight: Math.abs(this.state.dragStart.dragY - y)
      });
    }
  }

  render() {
    const { height, width, measures, x, y } = this.props;
    const { dragX, dragY, dragWidth, dragHeight, selectRanges } = this.state;

    return (
      <div style={{ ...style, height, width, left: x, top: y }}
        onMouseDown={this.onMouseDown} onMouseUp={this.onMouseUp} onMouseMove={this.onMouseMove}>
        { measures.map((_, i) => <Measure key={i} measureIndex={i} selected={selectRanges ? selectRanges[i] : undefined} />) }
        <SelectBox height={height} width={width} x={dragX} y={dragY} dragWidth={dragWidth} dragHeight={dragHeight} />
      </div>
    );
  }
}

export default connect(makeMapStateToProps(makeScoreSelector), { setSelectRange })(Score);