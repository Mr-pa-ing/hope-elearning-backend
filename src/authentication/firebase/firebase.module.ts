import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './firebase.module-definition';
import { FirebaseAuthService } from './services/firebase-auth.service';

@Module({
  providers: [FirebaseAuthService],
  exports: [FirebaseAuthService],
})
export class FirebaseModule extends ConfigurableModuleClass {}
