import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { PostEntity } from './post.entity';
import { PostStatisticDto } from '@/core/models/post-statistic.dto';

@Entity({ name: 'post_statistic' })
export class PostStatisticEntity {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'total_view', type: 'bigint', default: 0 })
  totalView: string;

  @OneToOne(() => PostEntity, (type) => type.statistic)
  @JoinColumn({ name: 'id' })
  post: PostEntity;

  toDto() {
    return new PostStatisticDto({
      totalView: this.totalView,
    });
  }
}
