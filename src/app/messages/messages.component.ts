import {Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked} from '@angular/core';
import {Message, Themes, Languages, User, MessageTypes} from '../common/data.model';
import {AuthService} from '../auth/auth.service';
import {
  trigger,
  state,
  style,
  animate,
  transition,
  group,
  keyframes
} from '@angular/animations';
import {ActivatedRoute, Router} from '@angular/router';
import * as _ from 'lodash';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {Observable} from 'rxjs/Observable';
import {AppStateService} from '../common/app-state.service';
import {RtdbService} from '../common/rtdb.service';
import {FirestoreService} from '../common/firestore.service';
import {AngularFireStorage} from 'angularfire2/storage';

import {fromEvent} from 'rxjs/observable/fromEvent';
import {map, filter, tap} from 'rxjs/operators';
import {LayoutService} from '../common/layout.service';

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.scss'],
  animations: [
    trigger('bounceInOut', [
      transition('void => *', [
        animate(300, keyframes([
          style({opacity: 0, transform: 'scale(0.1)', offset: 0}),
          style({opacity: 1, transform: 'scale(1.2)', offset: 0.3}),
          style({opacity: 1, transform: 'scale(1)', offset: 1})
        ]))
      ]),
      transition('* => void', [
        animate(300, keyframes([
          style({opacity: 1, transform: 'scale(1)', offset: 0}),
          style({opacity: 1, transform: 'scale(1.2)', offset: 0.7}),
          style({opacity: 0, transform: 'scale(0.1)', offset: 1})
        ]))
      ])
    ]),
    trigger('flyInOut', [
      state('in', style({width: '48%', transform: 'translateX(0)', opacity: 1})),
      transition('void => *', [
        style({width: 10, transform: 'translateX(50px)', opacity: 0}),
        group([
          animate('0.3s 0.1s ease', style({
            transform: 'translateX(0)',
            width: '48%'
          })),
          animate('0.3s ease', style({
            opacity: 1
          }))
        ])
      ]),
      transition('* => void', [
        group([
          animate('0.3s ease', style({
            transform: 'translateX(50px)',
            width: 10
          })),
          animate('0.3s 0.2s ease', style({
            opacity: 0
          }))
        ])
      ])
    ])
  ]
})

export class MessagesComponent implements OnInit, AfterViewChecked, OnDestroy {

  THEMES = Themes;

  // Param and object
  roomId: string;
  paramSubscription: any;
  languageSubject: BehaviorSubject<any>;
  languageQuery: object;

  newMessage: Message;

  currentUser$: Observable<User>;
  currentUser: User;

  roomMessages$: Observable<Message[]>;
  roomMessages: Message[];

  /** STORAGE **/
  previewURL: Observable<string>;
  file: Blob;
  uploadPercent: Observable<number>;
  uploadURL: Observable<string>;
  downloadURL: Observable<string>;

  constructor(private rtdbService: RtdbService,
              private firestoreService: FirestoreService,
              private afStorage: AngularFireStorage,
              public layoutService: LayoutService,
              public authService: AuthService,
              private appState: AppStateService,
              private router: Router,
              private route: ActivatedRoute) {

    this.languageSubject = new BehaviorSubject(null);
    this.roomMessages = [];
    this.newMessage = {};

    authService.authState$.subscribe(authUser => {
      this.currentUser$ = firestoreService.getUser(authUser.uid);
      this.currentUser$.subscribe(user => {
        this.currentUser = user;

        console.log('currentUser preferences', this.currentUser, this.currentUser.preferences);

        if (typeof this.currentUser.preferences.language !== 'undefined') {
          console.log('filtering by language type id', this.currentUser.preferences.language);
          this.filterByLanguage(this.currentUser.preferences.language);
        } else {
          this.filterByLanguage(Languages.English);
        }
      });
    });
  }

  ngOnInit() {
    this.layoutService.handleSectionId('messages');
    this.layoutService.handleShowToolbar(true);
    this.layoutService.handleShowNav(true);
    this.layoutService.handleShowDetails(false);

    this.paramSubscription = this.route.params.subscribe(params => {
      this.appState.setParams(params['roomId']);

      this.roomId = params['roomId'];

      if (typeof this.roomId !== 'undefined') {
        this.languageSubject = new BehaviorSubject(null);
        this.languageQuery = {
          orderByChild: 'language',
          equalTo: this.languageSubject
        };

        // this.roomMessages$ = this.rtdbService.getRoomMessages(this.roomId);
        this.roomMessages$ = this.firestoreService.getRoomMessagesByQuery(this.roomId, this.languageSubject);

        this.roomMessages$.subscribe(messages => {
          console.log('messages', messages);

          if (messages) {
            if (this.currentUser.preferences.moderate) {
              this.roomMessages = _.filter(messages, {moderated: true});
            } else {
              this.roomMessages = _.filter(messages, {moderated: false});
            }
            this.roomMessages = _.orderBy(this.roomMessages, 'timestamp', 'asc');
          } else {
            this.roomMessages = [];
          }

          console.log('room messages', this.roomMessages);
        });

        console.log('currentUser', this.currentUser);

        if (this.currentUser && typeof this.currentUser.preferences !== 'undefined') {
          console.log('filtering by language type id', this.currentUser.preferences.language);
          this.filterByLanguage(this.currentUser.preferences.language);
        }
      } else {
        this.router.navigate(['/messages']);
      }
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.paramSubscription.unsubscribe();
    this.languageSubject.unsubscribe();
    // this.roomMessages$.unsubscribe();
    // this.currentUser$.unsubscribe();
  }

  filterByLanguage(language: number) {
    this.languageSubject.next(language);
  }

  sendRoomMessage($event) {
    event.preventDefault();
    event.stopPropagation();

    this.newMessage.userId = this.currentUser.id;
    this.newMessage.name = this.currentUser.name;
    this.newMessage.avatar = this.currentUser.avatar;
    this.newMessage.language = this.currentUser.preferences.language;
    this.newMessage.moderated = false;

    if (this.file && this.previewURL) {
      const uploadTask = this.uploadFile();

      uploadTask.subscribe(url => {
        console.log('returned image url', url);

        if (url) {
          this.newMessage.type = MessageTypes.Image;
          this.newMessage.message = url;

          this.firestoreService.createRoomMessage(this.roomId, this.newMessage);

          this.newMessage = {};
          this.previewURL = null;
          this.file = null;
          this.downloadURL = null;
          this.uploadURL = null;
          this.uploadPercent = null;
        }
      });

    } else if (this.newMessage.message !== 'undefined') {
      this.newMessage.type = MessageTypes.Text;
      this.newMessage.message = this.newMessage.message.trim();

      this.firestoreService.createRoomMessage(this.roomId, this.newMessage);

      this.newMessage = {};

    }

    return false;
  }

  scrollToBottom() {
    try {
      document.getElementById('inner').scrollTop = document.getElementById('inner').scrollHeight;
    } catch (err) {
      console.error(err);
    }
  }

  /** STORAGE **/
  triggerInputFileClick (evt) {
    const element = document.getElementById('new-post-input');

    if (element) {
      element.click();
    } else {
      console.error('Could not find the new post input field!');
    }

    evt.preventDefault();
  }

  previewFile(event) {
    const reader = new FileReader();
    this.file = event.target.files[0];
    this.previewURL = fromEvent(reader, 'load').pipe(map(e => reader.result));
    reader.readAsDataURL(this.file);
  }

  removeFile(event) {
    this.file = null;
    this.previewURL = null;
  }

  uploadFile(): Observable<string> {
    const randomId = Math.random().toString(36).substring(7);

    const path = `${this.currentUser.id}/full/${this.roomId}/${randomId}`;

    console.log('new image storage path', path);

    // const task = this.afStorage.upload(path, this.file);
    const ref = this.afStorage.ref(path);
    const task = ref.put(this.file);

    task.snapshotChanges().subscribe(snap => {
      console.log('upload snapshot', snap);
    });

    // observe percentage changes
    this.uploadPercent = task.percentageChanges();
    this.uploadPercent.subscribe(snap => {
      console.log('upload pct snapshot', snap);
    });

    // get notified when the download URL is available
    this.downloadURL = task.downloadURL();
    this.downloadURL.subscribe(url => {
      console.log('upload download url', url);
    });

    /*
    this.uploadPercent = task.percentageChanges()
      .pipe(
        map(s => {
          const uploadPct = s.bytesTransferred / s.totalBytes * 100;
          console.log('upload percentage', uploadPct);
          return uploadPct;
        })
      );

    this.uploadURL = task.snapshotChanges()
      .pipe(
        filter(s => s.bytesTransferred === s.totalBytes),
        map(s => {
          const downloadUrl = s.downloadURL;
          console.log('downloadUrl', downloadUrl);
          return downloadUrl;
        }),
        tap(console.log)
      );
    */

    return this.downloadURL;
  }
}
