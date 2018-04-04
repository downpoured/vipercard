
/* auto */ import { RepeatingTimer, Root, cast } from '../../ui512/utils/utilsUI512.js';
/* auto */ import { UI512CursorAccess, UI512Cursors } from '../../ui512/utils/utilsCursors.js';
/* auto */ import { getStandardWindowBounds } from '../../ui512/utils/utilsDrawConstants.js';
/* auto */ import { UI512EventType } from '../../ui512/draw/ui512interfaces.js';
/* auto */ import { UI512ElGroup } from '../../ui512/elements/ui512elementsgroup.js';
/* auto */ import { UI512Application } from '../../ui512/elements/ui512elementsapp.js';
/* auto */ import { UI512ElButton } from '../../ui512/elements/ui512elementsbutton.js';
/* auto */ import { IdleEventDetails, MouseEnterDetails, MouseLeaveDetails, MouseUpEventDetails } from '../../ui512/menu/ui512events.js';
/* auto */ import { addDefaultListeners } from '../../ui512/textedit/ui512textevents.js';
/* auto */ import { UI512Controller } from '../../ui512/presentation/ui512presenter.js';

export class UI512DemoBasic extends UI512Controller {
    timer = new RepeatingTimer(2000);
    counter = 0;
    init(root: Root) {
        super.init(root);
        addDefaultListeners(this.listeners);

        let clientrect = getStandardWindowBounds();
        this.app = new UI512Application(clientrect, this);
        let grp = new UI512ElGroup('grpmain');
        this.app.addGroup(grp);
        this.inited = true;

        let btn1 = new UI512ElButton('btn1');
        grp.addElement(this.app, btn1);
        btn1.set('labeltext', 'abc\n12345678\nFile');
        btn1.setDimensions(300, 80, 90, 90);

        let btn2 = new UI512ElButton('btn2');
        grp.addElement(this.app, btn2);
        btn2.set('labeltext', 'pulsating');
        btn2.setDimensions(100, 90, 90, 90);

        this.invalidateAll();

        this.listenEvent(UI512EventType.MouseEnter, (_: object, r: Root, d: MouseEnterDetails) => {
            if (d.el && d.el.id === 'btn1') {
                UI512CursorAccess.setCursor(UI512Cursors.hand);
            }
        });

        this.listenEvent(UI512EventType.MouseLeave, (_: object, r: Root, d: MouseLeaveDetails) => {
            if (d.el && d.el.id === 'btn1') {
                UI512CursorAccess.setCursor(UI512Cursors.arrow);
            }
        });

        this.listenEvent(UI512EventType.Idle, (_: object, r: Root, d: IdleEventDetails) => {
            this.timer.update(d.milliseconds);
            if (this.timer.isDue()) {
                this.timer.reset();
                let getbtn2 = cast(this.app.getElemById('btn2'), UI512ElButton);
                getbtn2.set('labeltext', getbtn2.get_s('labeltext') === 'pulsating' ? 'pulsating...' : 'pulsating');
            }
        });

        this.listenEvent(UI512EventType.MouseUp, UI512DemoBasic.respondMouseUp);
        this.rebuildFieldScrollbars();
    }

    private static respondMouseUp(c: UI512DemoBasic, root: Root, d: MouseUpEventDetails) {
        if (d.button !== 0) {
            return;
        }

        if (d.elClick) {
            console.log('hello from ' + d.elClick.id);
            if (d.elClick.id === 'btn1') {
                c.counter += 1;

                let btn1 = cast(d.elClick, UI512ElButton);
                btn1.set('labeltext', 'counter: ' + c.counter.toString());
                btn1.setDimensions(btn1.x + 10, btn1.y + 10, btn1.w, btn1.h);
            }
        }
    }
}
