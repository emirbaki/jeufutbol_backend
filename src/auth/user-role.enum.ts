import { registerEnumType } from '@nestjs/graphql';

export enum UserRole {
    ADMIN = 'ADMIN',
    MANAGER = 'MANAGER',
    USER = 'USER',
}

registerEnumType(UserRole, {
    name: 'UserRole',
});
