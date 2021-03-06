
/* auto */ import { RememberHistory } from './../vpcutils/vpcUtils';
/* auto */ import { RequestedVelRef } from './../vpcutils/vpcRequestedReference';
/* auto */ import { OrdinalOrPosition, VpcElType, checkThrow, checkThrowEq, checkThrowInternal, findPositionFromOrdinalOrPosition, ordinalOrPositionIsPosition } from './../vpcutils/vpcEnums';
/* auto */ import { VpcElStack } from './velStack';
/* auto */ import { VpcElProductOpts } from './velProductOpts';
/* auto */ import { VpcModelTop } from './velModelTop';
/* auto */ import { VpcElField } from './velField';
/* auto */ import { VpcElCard } from './velCard';
/* auto */ import { VpcElButton } from './velButton';
/* auto */ import { VpcElBg } from './velBg';
/* auto */ import { VpcElBase } from './velBase';
/* auto */ import { O, tostring, trueIfDefinedAndNotNull } from './../../ui512/utils/util512Base';
/* auto */ import { assertWarn } from './../../ui512/utils/util512Assert';
/* auto */ import { Util512, assertWarnEq, cast, getEnumToStrOrFallback } from './../../ui512/utils/util512';

/* (c) 2019 moltenform(Ben Fisher) */
/* Released under the GPLv3 license */

/**
 * a script refers to an object that might or might not exist,
 * go from a RequestedVelRef to a concrete VpcElBase
 */
export class VelResolveReference {
    constructor(protected model: VpcModelTop) {}
    /**
     * resolve the reference
     * returns the given parent card as well,
     * since 'bg fld id 1234 of cd 1' is different than 'bg fld id 1234 of cd 2'
     */
    go(ref: RequestedVelRef, me: O<VpcElBase>, target: O<VpcElBase>, cardHistory: RememberHistory): O<VpcElBase> {
        checkThrow(ref instanceof RequestedVelRef, '76|invalid RequestedElRef');
        ref.checkOnlyOneSpecified();

        /* special categories */
        checkThrow(!ref.cardLookAtMarkedOnly || ref.type === VpcElType.Card, 'T<|');
        checkThrow(!ref.cardIsRecentHistory || ref.type === VpcElType.Card, 'T;|');
        if (ref.isReferenceToMe) {
            checkThrowEq(VpcElType.Unknown, ref.type, 'T:|');
            return me;
        } else if (ref.isReferenceToTarget) {
            checkThrowEq(VpcElType.Unknown, ref.type, '6}|');
            return target;
        } else if (ref.cardIsRecentHistory) {
            return this.getFromCardRecentHistory(ref, cardHistory);
        }

        /* some things should not be by position */
        if (ref.type === VpcElType.Btn || ref.type === VpcElType.Fld) {
            checkThrow(!ref.lookByRelative || !ordinalOrPositionIsPosition(ref.lookByRelative), 'W1|cannot be by position');
        }

        /* combine parents into one chain */
        this.combineParents(ref);

        /* resolve parents */
        let parentCard: O<VpcElCard>;
        let parentBg: O<VpcElBg>;
        if (ref.parentCdInfo) {
            let aParentCard = this.go(ref.parentCdInfo, me, target, cardHistory);
            checkThrow(aParentCard, 'W0|break, not found, parent not found');
            parentCard = cast(VpcElCard, aParentCard, 'break, not found, wrong parent type');
        }
        if (ref.parentBgInfo) {
            let aParentBg = this.go(ref.parentBgInfo, me, target, cardHistory);
            checkThrow(aParentBg, 'V~|break, not found, parent not found');
            parentBg = cast(VpcElBg, aParentBg, 'break, not found, wrong parent type');
        }
        if (ref.parentStackInfo) {
            let aParentStack = this.go(ref.parentStackInfo, me, target, cardHistory);
            checkThrow(aParentStack, 'V}|break, not found, parent not found');
            cast(VpcElStack, aParentStack, 'break, not found, wrong parent type');
            /* we can now safely ignore parentStack,
            since the only options are 1) doesn't exist
            and 2) exists and refers to this stack */
        }

        let ret: O<VpcElBase>;
        if (ref.partIsBg) {
            let found = this.lookForBgPart(ref, parentCard, parentBg);
            this.doParentsHaveRightHierarchy(found, ref, parentCard, parentBg);
            ret = this.doubleCheckVelType(found, ref, parentCard, parentBg);
        } else if (ref.lookById) {
            let found = this.model.findByIdUntyped(tostring(ref.lookById));
            this.doParentsHaveRightHierarchy(found, ref, parentCard, parentBg);
            ret = this.doubleCheckVelType(found, ref, parentCard, parentBg);
        } else {
            let methodName = 'go' + Util512.capitalizeFirst(getEnumToStrOrFallback(VpcElType, ref.type));
            let found = Util512.callAsMethodOnClass(
                VelResolveReference.name,
                this,
                methodName,
                [ref, parentCard, parentBg],
                false
            ) as O<VpcElBase>;
            this.doParentsHaveRightHierarchy(found, ref, parentCard, parentBg);
            ret = this.doubleCheckVelType(found, ref, parentCard, parentBg);
        }

        return ret;
    }

    /**
     * bg parts are complicated
     */
    protected lookForBgPart(ref: RequestedVelRef, parentCard: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        checkThrow(!parentBg, "V||can't say bg fld 1 of bg 3, have to access via a card");
        checkThrow(ref.type === VpcElType.Btn || ref.type === VpcElType.Fld, 'V{|only parts can belong to a bg');
        parentCard = parentCard ?? this.model.getCurrentCard();
        let arr = parentCard.parts.filter(vel => vel.getS('is_bg_velement_id').length > 0 && vel.getType() === ref.type);
        if (ref.lookById) {
            /* remember that for bg parts, userfacing id IS NOT THE SAME AS internal velid */
            let lookById = ref.lookById.toString();
            return arr.find(vel => vel.getS('is_bg_velement_id') === lookById);
        } else if (ref.lookByAbsolute !== undefined) {
            return arr[ref.lookByAbsolute - 1];
        } else if (ref.lookByName !== undefined) {
            return arr.find(vel => vel.getS('name').toLowerCase() === ref.lookByName?.toLowerCase());
        } else if (ref.lookByRelative) {
            let index = findPositionFromOrdinalOrPosition(ref.lookByRelative, 0, 0, arr.length - 1);
            return index === undefined ? undefined : arr[index];
        } else {
            checkThrow(false, 'V_|no specifier');
        }
    }

    /**
     * do parents make sense
     */
    protected doParentsHaveRightHierarchy(
        found: O<VpcElBase>,
        ref: RequestedVelRef,
        parentCard: O<VpcElCard>,
        parentBg: O<VpcElBg>
    ) {
        if (found && found.getType() === VpcElType.Stack) {
            checkThrow(!parentCard, 'V^|break, not found, cannot have this this type of parent');
            checkThrow(!parentBg, 'V]|break, not found, cannot have this this type of parent');
        } else if (found && found.getType() === VpcElType.Bg) {
            checkThrow(!parentCard, 'V[|break, not found, cannot have this this type of parent');
            checkThrow(!parentBg, 'V@|break, not found, cannot have this this type of parent');
        } else if (found && found.getType() === VpcElType.Card) {
            checkThrow(!parentCard, 'V?|break, not found, cannot have this this type of parent');
        }

        /* double-check classes */
        if (found && found.getType() === VpcElType.Card) {
            checkThrow(found instanceof VpcElCard, 'V>|break, not found, incorrect class');
        } else if (found && found.getType() === VpcElType.Fld) {
            checkThrow(found instanceof VpcElField, 'V=|break, not found, incorrect class');
        } else if (found && found.getType() === VpcElType.Product) {
            checkThrow(found instanceof VpcElProductOpts, 'V<|break, not found, incorrect class');
        } else if (found && found.getType() === VpcElType.Stack) {
            checkThrow(found instanceof VpcElStack, 'V;|break, not found, incorrect class');
        } else if (found && found.getType() === VpcElType.Bg) {
            checkThrow(found instanceof VpcElBg, 'V:|break, not found, incorrect class');
        } else if (found && found.getType() === VpcElType.Btn) {
            checkThrow(found instanceof VpcElButton, 'V/|break, not found, incorrect class');
        } else if (found) {
            checkThrow(false, 'V.|unknown type');
        }
    }

    /**
     * get the results, get the correct card to reference a bg item from
     */
    protected doubleCheckVelType(
        found: O<VpcElBase>,
        ref: RequestedVelRef,
        parentCard: O<VpcElCard>,
        parentBg: O<VpcElBg>
    ): O<VpcElBase> {
        if (!found) {
            return undefined;
        }

        /* confirm type lines up with what we expect */
        checkThrow(
            !found || ref.type === VpcElType.Unknown || ref.type === found.getType(),
            'V-|break, not found, unexpected type'
        );

        if (found.getType() === VpcElType.Card) {
            checkThrow(!parentBg || found.parentIdInternal === parentBg.idInternal, 'V,|break, not found, wrong card parent');
        } else if (found.getType() === VpcElType.Btn || found.getType() === VpcElType.Fld) {
            checkThrow(!parentCard || found.parentIdInternal === parentCard.idInternal, 'V+|break, not found, wrong card parent');
            checkThrow(!parentBg, "V*|break, not found, a card element can't belong to a bg");
        }

        checkThrow(!ref.cardLookAtMarkedOnly || ref.type === VpcElType.Card, 'V)|marked only is only for cards');
        if (found && found.getType() !== VpcElType.Fld && found.getType() !== VpcElType.Btn) {
            checkThrow(!ref.partIsBg, 'V(|does not make sense to belong to bg');
            checkThrow(!ref.partIsCd, 'V&|does not make sense to belong to cd');
        } else if (found) {
            assertWarn(ref.partIsCd || ref.partIsBg || ref.partIsCdOrBg, 'V%|expect to look up by cd or by bg');
        }

        if (ref.partIsCd) {
            /* important for preventing someone from
            using the internal true id to look up a bg btn */
            checkThrow(found.getS('is_bg_velement_id').length === 0, 'V#|break, not found, said to belong to card');
            checkThrow(!ref.partIsBg, 'V!|');
        }
        if (ref.partIsBg) {
            checkThrow(found.getS('is_bg_velement_id').length > 0, 'V |break, not found, said to belong to bg');
            checkThrow(!ref.partIsCd, 'Vz|');
        }

        return found;
    }

    /**
     * consolidate parents into one chain
     */
    protected combineParents(ref: RequestedVelRef) {
        if (ref.parentCdInfo) {
            if (ref.parentBgInfo) {
                ref.parentCdInfo.parentBgInfo = ref.parentBgInfo;
                ref.parentBgInfo = undefined;
                if (ref.parentStackInfo) {
                    ref.parentCdInfo.parentBgInfo.parentStackInfo = ref.parentStackInfo;
                    ref.parentStackInfo = undefined;
                }
            } else if (ref.parentStackInfo) {
                ref.parentCdInfo.parentStackInfo = ref.parentStackInfo;
                ref.parentStackInfo = undefined;
            }
        } else if (ref.parentBgInfo) {
            if (ref.parentStackInfo) {
                ref.parentBgInfo.parentStackInfo = ref.parentStackInfo;
                ref.parentStackInfo = undefined;
            }
        }
    }

    /**
     * implement "back", "forth". match product behavior: if card no longer exists, keep going
     */
    protected getFromCardRecentHistory(ref: RequestedVelRef, cardHistory: RememberHistory): O<VpcElBase> {
        let currentCard = this.model.getCurrentCard();
        let refersTo: O<string>;
        let fallback = () => currentCard.idInternal;
        let cardExists = (s: string) => {
            let cd = this.model.findByIdUntyped(s);
            return trueIfDefinedAndNotNull(cd) && cd.getType() === VpcElType.Card;
        };

        /* confirmed in the emulator that refering to 'back' doesn't alter its state */
        if (ref.cardIsRecentHistory === 'recent' || ref.cardIsRecentHistory === 'back') {
            refersTo = cardHistory.walkPreviousWhileAcceptible(fallback, cardExists);
            cardHistory.walkNextWhileAcceptible(fallback, cardExists);
        } else if (ref.cardIsRecentHistory === 'forth') {
            refersTo = cardHistory.walkNextWhileAcceptible(fallback, cardExists);
            cardHistory.walkPreviousWhileAcceptible(fallback, cardExists);
        }

        checkThrow(refersTo, `T-|can't see card "${ref.cardIsRecentHistory}"`);
        let cd = this.model.findByIdUntyped(refersTo);
        checkThrow(trueIfDefinedAndNotNull(cd) && cd.getType() === VpcElType.Card, 'J+|wrong type');
        return cd;
    }

    /**
     * share logic for buttons and fields
     */
    protected goFld(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>) {
        return this.goBtnOrFld(ref, parentCd, parentBg);
    }

    /**
     * share logic for buttons and fields
     */
    protected goBtn(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>) {
        return this.goBtnOrFld(ref, parentCd, parentBg);
    }

    /**
     * resolve a productopts
     */
    protected goProduct(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        checkThrow(
            !ref.lookByAbsolute &&
                !ref.lookById &&
                !ref.lookByName &&
                (!ref.lookByRelative || ref.lookByRelative === OrdinalOrPosition.This),
            'Vy|only one productOpts'
        );
        return this.model.productOpts;
    }

    /**
     * resolve a stack
     */
    protected goStack(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        if (ref.lookByName !== undefined) {
            /* `the short id of stack "myStack"` */
            if (ref.lookByName.startsWith('Hard Drive:')) {
                ref.lookByName = ref.lookByName.substr('Hard Drive:'.length);
            }

            return ref.lookByName.toLowerCase() === this.model.stack.getS('name').toLowerCase() ? this.model.stack : undefined;
        } else if (ref.lookByAbsolute !== undefined) {
            /* `the short id of stack 1` */
            return ref.lookByAbsolute === 1 ? this.model.stack : undefined;
        } else if (ref.lookByRelative) {
            /* `the short id of this stack` */
            if (
                ref.lookByRelative === OrdinalOrPosition.This ||
                ref.lookByRelative === OrdinalOrPosition.Any ||
                ref.lookByRelative === OrdinalOrPosition.Middle ||
                ref.lookByRelative === OrdinalOrPosition.Last ||
                ref.lookByRelative === OrdinalOrPosition.First
            ) {
                return this.model.stack;
            } else {
                return undefined;
            }
        } else {
            /* it's ok if no specifiers were given
            it is valid to say `get the number of cards of stack` */
            return this.model.stack;
        }
    }

    /**
     * resolve a bg
     */
    protected goBg(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        let arr = this.model.stack.bgs;
        if (ref.lookByName !== undefined) {
            /* `the short id of bg "theName"` */
            return arr.find(vel => vel.getS('name').toLowerCase() === ref?.lookByName?.toLowerCase());
        } else if (ref.lookByAbsolute !== undefined) {
            /* `the short id of bg 2` */
            return arr[ref.lookByAbsolute - 1];
        } else if (ref.lookByRelative) {
            /* `the short id of first bg, the short id of next bg` */
            let cur = this.model.getCurrentCard().parentIdInternal;
            let curIndex = arr.findIndex(item => item.idInternal === cur);
            let index = findPositionFromOrdinalOrPosition(ref.lookByRelative, curIndex, 0, arr.length - 1);
            return index === undefined ? undefined : arr[index];
        } else {
            checkThrow(false, 'Vx|unknown object reference');
        }
    }

    /**
     * resolve a card
     */
    protected goCard(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        let arr = this.model.stack.getCardOrder().map(item => this.model.getCardById(item));
        if (parentBg) {
            arr = parentBg.cards;
        }

        let currCdId = this.model.getCurrentCard().idInternal;
        if (ref.lookByName !== undefined) {
            if (ref.cardLookAtMarkedOnly) {
                arr = arr.filter(cd => cd.getB('marked'));
            }
            /* `the short id of cd "theName"` */
            let curId = this.model.getCurrentCard().idInternal;
            let pivot = arr.findIndex(vel => vel.idInternal === curId);
            if (pivot !== -1) {
                /* match product: start search from current card and wrap around */
                /* this doesn't happen for bg names. */
                let prevLen = arr.length;
                arr = arr.slice(pivot + 1).concat(arr.slice(0, pivot + 1));
                assertWarnEq(prevLen, arr.length, 'Vw|');
            }
            return arr.find(vel => vel.getS('name').toLowerCase() === ref?.lookByName?.toLowerCase());
        } else if (ref.lookByAbsolute !== undefined) {
            if (ref.cardLookAtMarkedOnly) {
                arr = arr.filter(cd => cd.getB('marked'));
            }
            /* `the short id of cd 2` */
            return arr[ref.lookByAbsolute - 1];
        } else if (ref.lookByRelative) {
            arr = this.model.stack.getCardOrder().map(item => this.model.getCardById(item));
            let keepCurCd =
                ref.lookByRelative === OrdinalOrPosition.Previous || /* bool */ ref.lookByRelative === OrdinalOrPosition.Next;
            let justMe = [this.model.getCurrentCard()];
            if (ref.cardLookAtMarkedOnly) {
                arr = arr.filter(cd => cd.getB('marked') || /* bool */ (keepCurCd && cd.idInternal === currCdId));
                justMe = justMe.filter(cd => cd.getB('marked'));
            }
            if (parentBg) {
                arr = arr.filter(
                    cd => cd.parentIdInternal === parentBg.idInternal || /* bool */ (keepCurCd && cd.idInternal === currCdId)
                );
                justMe = justMe.filter(cd => cd.parentIdInternal === parentBg.idInternal);
            }

            let curIndex = arr.findIndex(item => item.idInternal === currCdId);
            /* confirmed in emulator: */
            /* `the short id of this marked cd` should fail if this cd is not marked */
            /* `the short id of this cd of bg 2` should fail if this cd is not in bg 2 */
            checkThrow(
                !(keepCurCd && justMe.length === 0 && arr.length === 1 && arr[0].idInternal === currCdId),
                'Vv|break, not found, this/next does not meet criteria'
            );
            checkThrow(
                !(ref.lookByRelative === OrdinalOrPosition.This && curIndex === -1),
                "Vu|break, not found, 'this' card does not meet criteria"
            );
            let index = findPositionFromOrdinalOrPosition(ref.lookByRelative, curIndex, 0, arr.length - 1);
            return index === undefined ? undefined : arr[index];
        } else {
            checkThrowInternal(false, 'Vt|unknown object reference');
        }
    }

    /**
     * resolve a button or field
     */
    protected goBtnOrFld(ref: RequestedVelRef, parentCd: O<VpcElCard>, parentBg: O<VpcElBg>): O<VpcElBase> {
        checkThrow(!ref.partIsBg, 'Vs|should be covered elsewhere');
        checkThrow(!parentBg, 'Vr|does not make sense to have a parent bg');
        parentCd = parentCd ?? this.model.getCurrentCard();
        if (ref.lookByName !== undefined) {
            /* `the short id of cd btn "theName"` */
            return parentCd.parts.find(
                vel =>
                    vel.getType() === ref.type &&
                    vel.getS('name').toLowerCase() === ref?.lookByName?.toLowerCase() &&
                    !vel.getS('is_bg_velement_id').length
            );
        } else if (ref.lookByAbsolute !== undefined) {
            /* `the short id of cd btn 2` */
            let arr = parentCd.parts.filter(vel => vel.getType() === ref.type && !vel.getS('is_bg_velement_id').length);
            return arr[ref.lookByAbsolute - 1];
        } else if (ref.lookByRelative) {
            /* `the short id of first cd btn` */
            let arr = parentCd.parts.filter(vel => vel.getType() === ref.type && !vel.getS('is_bg_velement_id').length);
            let index = findPositionFromOrdinalOrPosition(ref.lookByRelative, 0, 0, arr.length - 1);
            return index === undefined ? undefined : arr[index];
        } else {
            checkThrow(false, 'T,|unknown object reference');
        }
    }

    /**
     * count number of elements
     * pretty limited, since we only support what the original product supported
     */
    countElements(type: VpcElType, parentRef: RequestedVelRef, cardHistory: RememberHistory) {
        let countMarked = parentRef.cardLookAtMarkedOnly;
        parentRef.cardLookAtMarkedOnly = false;
        let parent = this.go(parentRef, undefined, undefined, cardHistory);
        if (type === VpcElType.Product) {
            return 1;
        } else if (type === VpcElType.Stack) {
            return 1;
        } else if (type === VpcElType.Bg) {
            /* ensure parent exists and is a stack */
            checkThrow(parent && parent instanceof VpcElStack, 'Vq|could not find this object parent');
            return this.model.stack.bgs.length;
        } else if (type === VpcElType.Card) {
            if (parent instanceof VpcElStack) {
                let arr = parent.getCardOrder();
                if (countMarked) {
                    let cds = arr.map(id => this.model.findByIdUntyped(id)).filter(cd => cd?.getB('marked'));
                    return cds.length;
                } else {
                    return arr.length;
                }
            } else if (parent instanceof VpcElBg) {
                let arr = parent.cards;
                if (countMarked) {
                    let cds = arr.filter(cd => cd.getB('marked'));
                    return cds.length;
                } else {
                    return arr.length;
                }
            } else {
                checkThrow(false, 'Vp|could not find this object parent or incorrect type');
            }
        } else if (type === VpcElType.Btn || type === VpcElType.Fld) {
            if (parent instanceof VpcElBg) {
                let arr = parent
                    .getTemplateCard()
                    .parts.filter(vel => vel.getType() === type && vel.getS('is_bg_velement_id').length);
                return arr.length;
            } else if (parent instanceof VpcElCard) {
                let arr = parent.parts.filter(vel => vel.getType() === type && !vel.getS('is_bg_velement_id').length);
                return arr.length;
            } else {
                checkThrow(false, 'Vo|could not find this object parent or incorrect type');
            }
        } else {
            checkThrow(false, 'Vn|unknown type');
        }
    }
}
