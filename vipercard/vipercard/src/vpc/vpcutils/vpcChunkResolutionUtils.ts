
/* auto */ import { VpcIntermedValBase } from './vpcVal';
/* auto */ import { ReadableContainer, WritableContainer } from './vpcUtils';
/* auto */ import { OrdinalOrPosition, VpcChunkPreposition, VpcGranularity, checkThrow, checkThrowEq, checkThrowInternal, findPositionFromOrdinalOrPosition } from './vpcEnums';
/* auto */ import { O } from './../../ui512/utils/util512Base';
/* auto */ import { assertTrue, ensureDefined } from './../../ui512/utils/util512Assert';
/* auto */ import { Util512, ValHolder } from './../../ui512/utils/util512';
/* auto */ import { largeArea } from './../../ui512/drawtext/ui512DrawTextClasses';

/* (c) 2019 moltenform(Ben Fisher) */
/* Released under the GPLv3 license */

/*
 * the input is given as 1-based but
 * internally in this class we use 0-based indexes
 */
export const ChunkResolutionUtils = /* static class */ {
    /**
     * make a table of positions where items start
     * positions are 0-based
     * "a,bb,c" -> [0, 2, 5]
     */
    _getPositionsTable(s: string, type: VpcGranularity, itemDel: string): number[] {
        let re = ChunkResolutionUtils.getRegex(type, itemDel);
        let isWords = type === VpcGranularity.Words;
        let positions: number[] = [];
        if (!isWords || (!s.startsWith(' ') && !s.startsWith('\n'))) {
            positions.push(0);
        }

        while (true) {
            let match = re.exec(s);
            if (match) {
                let endOfMatch = match.index + match[0].length;
                if (!isWords || endOfMatch !== s.length) {
                    positions.push(endOfMatch);
                }
            } else {
                break;
            }
        }

        return positions;
    },

    /**
     * what is regex for this type
     */
    getRegex(type: VpcGranularity, delim: string): RegExp {
        if (type === VpcGranularity.Items) {
            /*
                if the script has said something like
                set the itemDel to "?"
                make sure it is one-character and that the regex is escaped
            */
            checkThrowEq(1, delim.length, '8m|delim should be length 1 but got', delim);
            let escaped = Util512.escapeForRegex(delim);
            return new RegExp(escaped, 'g');
        } else if (type === VpcGranularity.Lines) {
            return /\n/g;
        } else if (type === VpcGranularity.Words) {
            return new RegExp('(\\n| )+', 'g');
        } else {
            checkThrowInternal(false, 'no regex for this granularity');
        }
    },

    /**
     * get positions of the chunk, for chars.
     * return semi-inclusive bounds [start, end)
     */
    _charsBoundsForGet(sInput: string, start: number, end: number): O<[number, number]> {
        if (start >= sInput.length) {
            return undefined;
        } else {
            end = Math.min(end, sInput.length);
            return [start, end];
        }
    },

    /**
     * get positions of the chunk, for items.
     * return semi-inclusive bounds [start, end)
     */
    _itemsBoundsForGet(sInput: string, delim: string, start: number, end: number): O<[number, number]> {
        let table = this._getPositionsTable(sInput, VpcGranularity.Items, delim);
        if (start >= table.length) {
            return undefined;
        } else {
            let firstchar = table[start];
            let lastchar = end >= table.length ? sInput.length : table[end] - 1;
            return [firstchar, lastchar];
        }
    },

    /**
     * get positions of the chunk, for words.
     * confirmed in emulator: only spaces and newlines separate words, not punctuation.
     * return semi-inclusive bounds [start, end)
     */
    _wordsBoundsForGet(sInput: string, start: number, end: number, itemDel: string): O<[number, number]> {
        let table = this._getPositionsTable(sInput, VpcGranularity.Words, itemDel);
        if (start >= table.length) {
            return undefined;
        } else {
            let firstchar = table[start];
            let lastchar = end >= table.length ? sInput.length : table[end] - 1;
            while (lastchar > 0 && (sInput[lastchar - 1] === '\n' || sInput[lastchar - 1] === ' ')) {
                lastchar--;
            }

            return [firstchar, lastchar];
        }
    },

    /**
     * when you say put "abc" into char x to y of z, which positions should be replaced with "abc"?
     */
    _charsBoundsForSet(sInput: string, start: number, end: number): any {
        if (start >= sInput.length) {
            return [sInput.length, sInput.length, ''];
        } else {
            end = Math.min(end, sInput.length);
            return [start, end, ''];
        }
    },

    /**
     * when you say put "abc" into item x to y of z, which positions should be replaced with "abc"?
     */
    _itemsBoundsForSet(sInput: string, delim: string, start: number, end: number): any {
        let table = this._getPositionsTable(sInput, VpcGranularity.Items, delim);
        if (start >= table.length) {
            /* you can set items beyond current content, add trailing commas! */
            let howmanytoadd = 1 + (start - table.length);
            let trailingCommas = Util512.repeat(howmanytoadd, delim).join('');
            return [sInput.length + howmanytoadd, sInput.length + howmanytoadd, trailingCommas];
        } else {
            let firstchar = table[start];
            let lastchar = end >= table.length ? sInput.length : table[end] - 1;
            return [firstchar, lastchar, ''];
        }
    },

    /**
     * when you say put "abc" into word x to y of z, which positions should be replaced with "abc"?
     */
    _wordsBoundsForSet(sInput: string, start: number, end: number, itemDel: string): any {
        let boundsGet = this._wordsBoundsForGet(sInput, start, end, itemDel);
        if (boundsGet === undefined) {
            return [sInput.length, sInput.length, ''];
        } else {
            return [boundsGet[0], boundsGet[1], ''];
        }
    },

    /**
     * we've been asked to get item x to y of z.
     * return semi-inclusive bounds [start, end)
     */
    _getBoundsForGet(s: string, itemDel: string, ch: RequestedChunk): O<[number, number]> {
        let first = ch.first;
        let last = ch.last;
        if (ch.ordinal !== undefined) {
            let count = ChunkResolutionUtils.applyCount(s, itemDel, ch.granularity, false);
            let maybeFirst = findPositionFromOrdinalOrPosition(ch.ordinal, 0, 1, count);
            if (maybeFirst === undefined) {
                return undefined;
            } else {
                first = maybeFirst;
            }

            last = first;
        }

        checkThrow(first >= 0 && (!last || last >= 0), 'do not allow negative');
        if (ch.granularity === VpcGranularity.Chars && last !== undefined && last < first) {
            /* checked in emulator, behavior for chars differs here for some reason. */
            return undefined;
        }

        assertTrue(first !== null && first !== undefined && last !== null, '5=|invalid first or last');
        last = last === undefined ? first : last;
        last = last < first ? first : last;
        if (first <= 0) {
            return undefined;
        } else if (s.length === 0) {
            return undefined;
        }

        /* convert from one-based to zero-based */
        let start = first - 1;
        last -= 1;
        let end = last;

        /* from inclusive to semiinclusive */
        end++;

        /* type-specific actions */
        if (ch.granularity === VpcGranularity.Chars) {
            return this._charsBoundsForGet(s, start, end);
        } else if (ch.granularity === VpcGranularity.Items) {
            return this._itemsBoundsForGet(s, itemDel, start, end);
        } else if (ch.granularity === VpcGranularity.Lines) {
            return this._itemsBoundsForGet(s, '\n', start, end);
        } else if (ch.granularity === VpcGranularity.Words) {
            return this._wordsBoundsForGet(s, start, end, itemDel);
        } else {
            checkThrow(false, `5<|unknown chunk granularity ${ch.granularity}`);
        }
    },

    /**
     * we've been asked to get item x to y of z.
     * return semi-inclusive bounds [start, end)
     */
    _getBoundsForSet(sInput: string, itemDel: string, ch: RequestedChunk): [number, number, string] {
        let first = ch.first;
        let last = ch.last;
        if (ch.ordinal !== undefined) {
            let upperBound = largeArea;
            if (
                ch.ordinal === OrdinalOrPosition.Last ||
                ch.ordinal === OrdinalOrPosition.Middle ||
                ch.ordinal === OrdinalOrPosition.Any
            ) {
                upperBound = ChunkResolutionUtils.applyCount(sInput, itemDel, ch.granularity, false);
            }

            first = ensureDefined(findPositionFromOrdinalOrPosition(ch.ordinal, 0, 1, upperBound), 'too big an index');
            last = first;
        }

        checkThrow(first >= 0 && (!last || last >= 0), 'do not allow negative');
        assertTrue(first !== null && first !== undefined && last !== null, '5;|invalid first or last');
        if (ch.granularity === VpcGranularity.Chars && last !== undefined && last < first) {
            /* checked in emulator, behavior for chars differs here for some reason. */
            return [first - 1, first - 1, ''];
        }

        last = last === undefined ? first : last;
        last = last < first ? first : last;
        if (first <= 0) {
            return [0, 0, ''];
        }

        /* convert from one-based to zero-based */
        let start = first - 1;
        last -= 1;
        let end = last;

        /* from inclusive to semiinclusive */
        end++;

        /* type-specific actions */
        if (ch.granularity === VpcGranularity.Chars) {
            return this._charsBoundsForSet(sInput, start, end);
        } else if (ch.granularity === VpcGranularity.Items) {
            return this._itemsBoundsForSet(sInput, itemDel, start, end);
        } else if (ch.granularity === VpcGranularity.Lines) {
            return this._itemsBoundsForSet(sInput, '\n', start, end);
        } else if (ch.granularity === VpcGranularity.Words) {
            return this._wordsBoundsForSet(sInput, start, end, itemDel);
        } else {
            checkThrow(false, `5:|unknown chunk type ${ch.granularity}`);
        }
    },

    /**
     * count chunks, e.g.
     * 'put the number of words in x into y'
     */
    applyCount(sInput: string, itemDel: string, type: VpcGranularity, isPublicCall: boolean) {
        /* in the public interface, change behavior to match original product
        behavior confirmed in emulator. */
        let adjust = 0;
        if (isPublicCall && sInput === '') {
            return 0;
        } else if (isPublicCall && type === VpcGranularity.Items && !sInput.includes(itemDel) && sInput.trim() === '') {
            return 0;
        } else if (isPublicCall && type === VpcGranularity.Lines && sInput.endsWith('\n')) {
            adjust = -1;
        } else if (isPublicCall && type === VpcGranularity.Items && sInput.trim().endsWith(',')) {
            if (sInput) {
                adjust = -1;
            } else {
                return 1;
            }
        }

        if (type === VpcGranularity.Chars) {
            return sInput.length + adjust;
        } else {
            return ChunkResolutionUtils._getPositionsTable(sInput, type, itemDel).length + adjust;
        }
    },

    /**
     * go from "word 2 to 5" to the character start+end positions.
     * this might be a child of a parent scope, so
     * remember to adjust based on parent.startPos!
     */
    doResolveOne(
        request: RequestedChunk,
        parent: ResolvedChunk,
        itemDel: string,
        news: O<string>,
        compat: boolean,
        prep: O<VpcChunkPreposition>,
        isWriteContext: boolean,
        isChildOfAddedLine: boolean,
        okToAppend: boolean,
        addedExtra?: ValHolder<boolean>
    ): O<ResolvedChunk> {
        let unformatted = parent.container.getRawString();
        unformatted = unformatted.substring(parent.startPos, parent.endPos);
        let retbounds: O<[number, number]>;
        if (isWriteContext) {
            let bounds = this._getBoundsForSet(unformatted, itemDel, request);
            let writeParentContainer = parent.container as WritableContainer;
            if (news === undefined) {
                if (compat && parent.startPos === parent.endPos && isChildOfAddedLine && bounds[2]) {
                    bounds[2] = '';
                }

                /* still add our commas to the end */
                let fakeNewS = '';
                okToAppend = true;
                let result = fakeNewS + okToAppend ? bounds[2] : '';
                let insertionPoint = parent.startPos + bounds[0];
                if (bounds[2] && addedExtra) {
                    addedExtra.val = true;
                }
                if (bounds[2]) {
                    insertionPoint = Math.min(parent.endPos, insertionPoint);
                }
                writeParentContainer.splice(insertionPoint, 0 /* delete nothing */, result);
                if (bounds[2]) {
                    retbounds = [
                        -parent.startPos + insertionPoint + result.length,
                        -parent.startPos + insertionPoint + result.length
                    ];
                } else {
                    retbounds = [-parent.startPos + insertionPoint, bounds[1] + result.length];
                }
            } else if (prep === VpcChunkPreposition.Into || (bounds[2] && bounds[2].length)) {
                if (compat && parent.startPos === parent.endPos && isChildOfAddedLine && bounds[2]) {
                    bounds[2] = '';
                }
                /* it's a brand new item, adding 'before' or 'after' isn't applicable */
                let result = bounds[2] + news;
                let insertionPoint = parent.startPos + bounds[0];
                if (bounds[2] && addedExtra) {
                    addedExtra.val = true;
                }
                if (bounds[2] && !okToAppend) {
                    insertionPoint = Math.min(parent.endPos, insertionPoint);
                }
                writeParentContainer.splice(insertionPoint, bounds[1] - bounds[0], result);
                retbounds = [insertionPoint, insertionPoint + result.length];
            } else if (prep === VpcChunkPreposition.After) {
                writeParentContainer.splice(parent.startPos + bounds[1], 0, news);
                retbounds = [bounds[1], bounds[1] + news.length];
            } else if (prep === VpcChunkPreposition.Before) {
                writeParentContainer.splice(parent.startPos + bounds[0], 0, news);
                retbounds = [bounds[0], bounds[0] + news.length];
            } else {
                checkThrow(false, `5,|unknown preposition ${prep}`);
            }
        } else {
            assertTrue(!news, '');
            assertTrue(!prep || prep === VpcChunkPreposition.Into, '');
            retbounds = this._getBoundsForGet(unformatted, itemDel, request);
        }

        if (retbounds) {
            let ret = new ResolvedChunk(parent.container, parent.startPos + retbounds[0], parent.startPos + retbounds[1]);
            checkThrow(ret.startPos >= 0 && ret.endPos >= 0, 'somehow got a negative');
            return ret;
        } else {
            return undefined;
        }
    }
};

/**
 * a requested chunk from a script.
 */
export class RequestedChunk extends VpcIntermedValBase {
    granularity = VpcGranularity.Chars;
    first: number;
    last: O<number>;
    ordinal: O<OrdinalOrPosition>;
    sortFirst = false;
    child: O<RequestedChunk>;
    constructor(first: number) {
        super();
        this.first = first;
    }

    /**
     * get a copy of this structure
     */
    getClone() {
        let other = new RequestedChunk(this.first);
        other.granularity = this.granularity;
        other.first = this.first;
        other.last = this.last;
        other.ordinal = this.ordinal;
        other.sortFirst = this.sortFirst;
        other.child = this.child?.getClone();
        return other;
    }

    /**
     * are bounds backwards? we sometimes support this
     */
    hasBackwardsBounds(): boolean {
        return this.last !== undefined && this.last < this.first;
    }
}

/**
 * a resolved chunk.
 */
export class ResolvedChunk {
    constructor(public container: ReadableContainer, public startPos: number, public endPos: number) {}
}
