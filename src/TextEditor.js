/**
 * @file TextEditor React Component based on Draft
 * @author Isaac Suttell <isaac@isaacsuttell.com>
 * @see https://facebook.github.io/draft-js/docs/overview.html
 */
// Modules
import React, {Component, PropTypes} from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import Immutable from 'immutable';
import { Editor, EditorState, ContentState, RichUtils, convertToRaw, convertFromRaw, CompositeDecorator, Modifier } from 'draft-js';
import {convertFromHTML, convertToHTML} from 'draft-convert';

// Components & Helpers
import StyleButton from './StyleButton';
import linkStrategy from './link/linkStrategy';
import Link from './link/Link';
import BlockTypes from './BlockTypes';
import InlineStyles from './InlineStyles';
import ChangeEvent from './ChangeEvent';

// CSS Module
import css from './TextEditor.css';

/**
 * Helper function to setup any decorators
 * @param    {Object}    props
 * @return   {Array<Object>}
 */
function setupDecorators(props) {
  // Configure custom decorators
  let decorators = [];

  // Convert links inline
  if (props.convertLinksInline) {
    decorators.push({
      strategy: linkStrategy,
      component: Link
    });
  }

  return decorators;
}

export default class TextEditor extends Component {
  constructor(props) {
    super(props);

    // Convert incoming to somethign draft-js friendly
    const content = this.convertContentFrom(props);

    // Configure custom decorators
    let decorators = setupDecorators(props);

    // Setup decorators
    const compositeDecorator = new CompositeDecorator(decorators);

    // Create State
    const editorState = EditorState.createWithContent(content, compositeDecorator);

    // Set state the first time
    this.state = {
      focus: false,
      editorState,
      stickyControlsStyle: null
    };

    // Binding
    this.handleEditorChange = this.handleEditorChange.bind(this);
    this.handleKeyCommand = this.handleKeyCommand.bind(this);
    this.handleScrollEvent = this.handleScrollEvent.bind(this);
    this.focus = this.focus.bind(this);
    this.handleInlineStyleClick = this.handleInlineStyleClick.bind(this);
    this.handleBlockStyleClick = this.handleBlockStyleClick.bind(this);
    this.convertHTMLToString = this.convertHTMLToString.bind(this);
    this.forceUpdate = this.forceUpdate.bind(this);
  }

  /**
   * Performance catch
   */
  shouldComponentUpdate(nextProps, nextState) {
    return nextProps.editable !== this.props.editable ||
      nextState.focus !== this.state.focus ||
      nextState.editorState !== this.state.editorState ||
      nextState.stickyControlsStyle !== this.state.stickyControlsStyle;
  }

  /**
   * Public method to cause the editor to reread it's props.value. Often used
   * when resetting the form.
   * @public
   * @example this.refs.editor.forceUpdate();
   */
  forceUpdateState(props = this.props) {
    // Convert incoming to somethign draft-js friendly
    const content = this.convertContentFrom(props);

    // Generate new date
    const updatedEditorState = EditorState.push(this.state.editorState, content);

    // Update
    this.handleEditorChange(updatedEditorState);
  }

  /**
   * Get the content depending on the type of data we're passing around
   */
  convertContentFrom(props = this.props) {
    if (!props.value) {
      return ContentState.createFromText('');
    } else if (props.type === 'json') {
      return convertFromRaw(props.value);
    } else if (props.type === 'html') {
      return convertFromHTML(props.value);
    } else {
      return props.value;
    }
  }

  /**
   * Convert the content depending on what the parent wants
   */
  convertContentTo() {
    const content = this.state.editorState.getCurrentContent();

    if (this.props.type === 'json') {
      return convertToRaw(content);
    } else if (this.props.type === 'html') {
      return convertToHTML(content);
    } else if (this.props.type === 'text') {
      return this.convertHTMLToString(content);
    } else {
      return content;
    }
  }

  /**
   * Removes the HTML tags from Strings
   *
   * @param     {String}    str
   * @return    {String}    str
   */
  convertHTMLToString(str) {
    if (typeof str !== 'string') {
      return str;
    }
    return str.replace(/<\/?[^>]+(>|$)/g, '');
  }

  /**
   * Keyboard shortcuts
   */
  handleKeyCommand(command) {
    let content;
    let editor;
    let {editorState} = this.state;

    const newEditorStatue = RichUtils.handleKeyCommand(editorState, command);

    // Split the selected block into two blocks on 'Enter' command.
    // ONLY ON HTML TYPE
    // @see https://draftjs.org/docs/api-reference-modifier.html#splitblock
    if (command === 'split-block' && this.props.type === 'html') {
      content = Modifier
        .splitBlock(editorState.getCurrentContent(), editorState.getSelection());
      editor = EditorState.push(editorState, content, 'split-block');

      this.handleEditorChange(editor);
      return 'handled';
    } else if (newEditorStatue) {
      this.handleEditorChange(newEditorStatue);
      return 'handled';
    }

    return 'not-handled';
  }

  /**
   * Text editor change
   */
  handleEditorChange(editorState) {
    // Get the current selection so we can see if we have active focus
    const focus = editorState.getSelection().getHasFocus();

    this.setState({
      editorState,
      focus
    },()=>{
      if (typeof this.props.onChange !== 'function') {
        return;
      }

      // Convert from draft-fs format to html so its seamless with the rest of
      // the application. Should remove this eventually
      const value = this.convertContentTo();

      let event = new ChangeEvent(value, {
        ref: this
      });

      // limit change events to only times it changed
      this.props.onChange(event);
    });
  }

  /**
   * Refocus the cursor on the editor
   * @public
   */
  focus(){
    this.refs.editor.focus();
  }


  componentDidMount() {

    // Optionally make controls stick to the top, instead of scrolling out of view
    if(this.props.stickyControls) {
      window.addEventListener('scroll', this.handleScrollEvent);
    }
  }

  /**
   * Get CSS styles to position the "controls" component such that the
   * right edge of the controls component is aligned with the right
   * edge of the "editor" component.
   *
   * @param offsetTop
   * @returns {{position: string, top: *, right: number, zIndex: string}}
   * @private
   */
  getStickyControlsStyles(offsetTop) {

    let editorEl = ReactDOM.findDOMNode(this.refs.editor);
    let currEl = editorEl;
    let offsetLeft = 0;
    // Search up the tree and add up offsets to find the offset of the left edge
    while (currEl) {
      offsetLeft += (currEl.offsetLeft + currEl.clientLeft);
      currEl = currEl.offsetParent;
    }

    // Add the left offset to the width to find the offset of the right 
    // edge, then subtract that from the width of the window to get the
    // "right offset".
    let offsetRight = window.innerWidth - (offsetLeft + editorEl.offsetWidth);

    return {
      position: "fixed",
      top: offsetTop,
      right: offsetRight,
      zIndex: "1000"
    };
  }

  /**
   * Event handler for window scroll. Set style for stickyControls as needed.
   */
  handleScrollEvent() {

    // Optionally offset from the top of the window to account for a header 
    let headerOffset = this.props.stickyControls.headerOffset || 0;

    // StyleButton--btn.height from StyleButton.css
    const styleButtonHeight = 42;

    // Detect whether the top of the text editor controls have scrolled above the top of the window
    // (optionally taking a header into account). Unstick the controls if the entire text editor 
    // is above the top of the window.
    let parentEl = ReactDOM.findDOMNode(this);
    if (parentEl.getBoundingClientRect().top < headerOffset + styleButtonHeight &&
      parentEl.getBoundingClientRect().bottom > headerOffset)  {
      this.setState({stickyControlsStyle: this.getStickyControlsStyles(styleButtonHeight)});
    } else {
      this.setState({stickyControlsStyle: null});
    }
  }


  /**
   * Toggle an inline style
   */
  handleInlineStyleClick(inlineStyle, event) {
    if (!this.props.editable) {
      return;
    } else if (event) {
      event.preventDefault();
    }

    // Generate new state with inline style applied
    const editorState = RichUtils.toggleInlineStyle(this.state.editorState, inlineStyle);

    // Update
    this.handleEditorChange(editorState);
  }

  /**
   * Toggle an inline style
   */
  handleBlockStyleClick(blockStyle, event) {
    if (!this.props.editable) {
      return;
    } else if (event) {
      event.preventDefault();
    }

    // Generate new state with block style applied
    const editorState = RichUtils.toggleBlockType(this.state.editorState, blockStyle);

    // Update
    this.handleEditorChange(editorState);
  }

  /**
   * Make it all happen
   * @return    {React}
   */
  render() {
    // Grab the state of the editor, part of draft-fs
    const {editorState} = this.state;

    // Get the current selection so we can see if we have active focus
    const selectionState = editorState.getSelection();

    // Get the current style of the selection so we can change the look of the
    // buttons
    const currentInlineStyle = editorState.getCurrentInlineStyle();

    // Determing the current blockt ype
    const blockType = editorState.getCurrentContent().getBlockForKey(selectionState.getStartKey()).getType();
    const {noStyleButtons, onlyInline} = this.props;

    return (
      <div className={classNames(css.container, this.props.className, 'text-editor', {
        'text-editor--editable': this.props.editable,
        'text-editor--focus': this.state.focus,
        [css.editable]: this.props.editable,
        [css.focus] : this.state.focus
      })}>
        {this.props.editable && !noStyleButtons ?
          <div className={css.controls} style={this.state.stickyControlsStyle}>
            {InlineStyles
              // Allow user to select styles to show
              .filter(type => this.props.inlineStyles.has(type.style))
              .map(type => {
                return (
                  <StyleButton
                    className={this.props.buttonClass}
                    key={type.style}
                    editorState={editorState}
                    // Determine if the style is active or not
                    active={selectionState.getHasFocus() && currentInlineStyle.has(type.style)}
                    onMouseDown={this.handleInlineStyleClick.bind(this, type.style)}
                    {...type}
                  />
                );
              })}
              {!onlyInline ? BlockTypes
                // Allow user to select styles to show
                .filter(type => this.props.blockTypes.has(type.style))
                .map(type => {
                  return (
                    <StyleButton
                      className={this.props.buttonClass}
                      key={type.style}
                      editorState={editorState}
                      active={type.style === blockType}
                      onMouseDown={this.handleBlockStyleClick.bind(this, type.style)}
                      {...type}
                    />
                  );
                }) : null}
          </div>
        : null}
        <div
          onClick={this.focus}
          className={css.editor}
        >
          <Editor
            ref='editor'
            editorState={editorState}
            onChange={this.handleEditorChange}
            handleKeyCommand={this.handleKeyCommand}
            placeholder={this.props.editable ? this.props.placeholder : void 0}
            readOnly={!this.props.editable}
            onFocus={this.props.onFocus}
            onBlur={this.props.onBlur}
            stripPastedStyles={this.props.stripPastedStyles}
            spellCheck={this.props.spellCheck}
            tabIndex={this.props.tabIndex}
          />
        </div>
      </div>
    );
  }
}

/**
 * Type checking
 * @type    {Object}
 */
TextEditor.propTypes = {
  inlineStyles: PropTypes.instanceOf(Immutable.Set),
  blockTypes: PropTypes.instanceOf(Immutable.Set),
  tabIndex: PropTypes.number,
  className: PropTypes.string,
  buttonClass: PropTypes.string,
  editable: PropTypes.bool,
  value: PropTypes.any.isRequired,
  type: PropTypes.oneOf(['html', 'json', 'Immutable']),
  spellCheck: PropTypes.bool,
  convertLinksInline: PropTypes.bool,
  stripPastedStyles: PropTypes.bool,
  noStyleButtons: PropTypes.bool,
  onlyInline: PropTypes.bool
};

/**
 * Defaults
 * @type    {Object}
 */
TextEditor.defaultProps = {
  noStyleButtons: false,
  onlyInline: false,
  inlineStyles: new Immutable.Set(['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'CODE']),
  blockTypes: new Immutable.Set(['blockquote', 'code-block', 'unordered-list-item', 'ordered-list-item', 'header-one', 'header-two', 'header-three', 'header-four', 'header-five', 'header-six']),
  editable: true,
  type: 'html',
  spellCheck: true,
  convertLinksInline: true,
  stripPastedStyles: true
};
